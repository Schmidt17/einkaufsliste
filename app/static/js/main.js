// set up location tracking for figuring out where we are shopping
var client_coords = {
    latitude: null,
    longitude: null
};

function updateCoords(geolocationPos) {
    client_coords.latitude = geolocationPos.coords.latitude;
    client_coords.longitude = geolocationPos.coords.longitude;
}

var posWatchId = navigator.geolocation.watchPosition(updateCoords);

// prepare tags
var all_tags = [];
updateTagList();

var filters = new Set();
var noTagsFilter = '42ef91e6101f62a0';

// configuration for the connection to the MQTT broker
const mqtt_host = "broker.hivemq.com";
const mqtt_port = 8884;

// create a MQTT client instance
const client = new Paho.MQTT.Client(mqtt_host, mqtt_port, "");

// variables to store actions that can be defined by the user
var connectFollowUpAction = function() {};
var connectionLostFollowUpAction = function() {};

// set callback functions
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = function (message) {
    msgObj = JSON.parse(message.payloadString);

    if (message.destinationName == topic) {
        const card = getCardByItemId(msgObj.id);

        if (card != null) { 
            if (card.done != msgObj.status) {
                toggleCardDone(card);
            }
        }
    }

    if (message.destinationName == topic_newItem) {
        reloadItems();
    }
};

function getCardByItemId(itemId) {
    const cardContainer = document.getElementById('card-container');
    const allItemCards = cardContainer.querySelectorAll('.item-card');

    for (const card of allItemCards) {
        if (card.itemData.id == itemId) {
            return card;
        }
    }

    return null;
}

// called when the client has connected
function onConnectSuccess() {
  // Once a connection has been made, subscribe to the needed channels
  console.log("Connected to MQTT broker at " + mqtt_host + ":" + mqtt_port);

  client.subscribe(topic, {qos: 1});
  console.log("Subscribed to topic " + topic);

  client.subscribe(topic_newItem, {qos: 1});
  console.log("Subscribed to topic " + topic_newItem);

  // execute the follow-up function as defined by the user
  connectFollowUpAction();
}

// called when the connection process has failed
function onConnectFailure() {
  console.log("Connecting to the MQTT broker at " + mqtt_host + ":" + mqtt_port + " has failed");

  console.log("Trying to reconnect ...");
  connectToBroker(connectFollowUpAction, client.onMessageArrived, connectionLostFollowUpAction, topic);
}

// function to attempt to connect the client to the MQTT broker
function connectToBroker(newConnectFollowUpAction, newOnMessageArrived, newOnConnectionLost, mqttTopic) {
  console.log("Trying to connect to MQTT broker at " + mqtt_host + ":" + mqtt_port + " ...");

  // set up the user-defined configuration
  connectFollowUpAction = newConnectFollowUpAction;
  connectionLostFollowUpAction = newOnConnectionLost;
  client.onMessageArrived = newOnMessageArrived;
  topic = mqttTopic;

  client.connect({
    onSuccess: onConnectSuccess,
    onFailure: onConnectFailure,
    useSSL: true
  });
}


// called when the client loses its connection
function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0) {
    console.log("onConnectionLost:" + responseObject.errorMessage);
  }

  connectionLostFollowUpAction();

  console.log("Trying to reconnect ...");
  connectToBroker(connectFollowUpAction, client.onMessageArrived, connectionLostFollowUpAction, topic);
}

connectToBroker(connectFollowUpAction, client.onMessageArrived, connectionLostFollowUpAction, topic);


function updateTagList() {
    fetch(`https://picluster.a-h.wtf/${encodeURIComponent(url_root)}/api/v1/tags?k=${encodeURIComponent(api_key)}`)
      .then((response) => response.json())
      .then((json) => {all_tags = json.tags})
      .then(() => populateFilterTags())
}


function populateFilterTags() {
    const chipContainer = document.querySelector('.filter-chips');
    // remove all current chips
    chipContainer.querySelectorAll('.chip').forEach((e) => e.remove());

    // add the new chips
    const newChip = newFilterChip('No tags', noTagsFilter);
    chipContainer.appendChild(newChip);

    all_tags.forEach((tag) => {
        const newChip = newFilterChip(tag, tag);
        chipContainer.appendChild(newChip);
    });
}

function newFilterChip(tag, filterName) {
    const newChip = createFromTemplate('chip-template');
    newChip.innerText = tag;
    newChip.activated = false;
    newChip.addEventListener('click', function() {
        this.classList.toggle('darken-1')
        this.classList.toggle('white-text')

        if (this.activated) {
            this.activated = false
            filters.delete(filterName)
        } else {
            this.activated = true
            filters.add(filterName)
        }

        updateFilters();
    })

    return newChip;
}

function updateFilters() {
    const cardContainer = document.getElementById('card-container');
    const cards = cardContainer.querySelectorAll('.item-card');

    // in case of no filters, make all cards visible
    if (filters.size == 0) {

        for (const card of cards) {
            card.style.display = 'block'
        }

    } else {

        // apply the filters
        for (const card of cards) {
            let visible = false;
            for (const tag of card.itemData.tags) {
                if (filters.has(tag)) {
                    visible = true;
                    break;
                }
            }

            if (card.itemData.tags.length == 0) {
                if (filters.has(noTagsFilter)) {
                    visible = true;
                }
            }

            if (visible) {
                card.style.display = 'block'
            } else {
                card.style.display = 'none'
            }
            
        }

    }
}

function getCardTitle(card) {
    return card.querySelector('.card-title');
}


function toggleCardDoneStyle(card) {
    card.classList.toggle('grey');
    card.classList.toggle('lighten-2');
    card.classList.toggle('grey-text');

    getCardTitle(card).classList.toggle('line-through');
}

function updateCardAriaLabel(card) {
    const cardTitle = getCardTitle(card);

    if (card.done) {
        cardTitle.ariaLabel = 'Durchgestrichen: ' + cardTitle.innerText;
    } else {
        cardTitle.ariaLabel = cardTitle.innerText;
    }
}


function toggleCardDone(card) {
    card.done = !card.done;

    toggleCardDoneStyle(card);
    updateCardAriaLabel(card);
}


function initCard(card, itemData) {
    card.done = itemData.done;
    card.itemData = itemData;

    if (card.done) {
        toggleCardDoneStyle(card);
    }

    updateCardAriaLabel(card);

    card.addEventListener('click', () => {
        toggleCardDone(card);
        updateDone(card.itemData.id, card.done);
        collectAction(card.itemData.id, card.itemData.title, card.done);
    });
}

function addItemCard(itemData, beforeElt=null) {
    const cardContainer = document.getElementById('card-container');
    const cardTemplate = document.getElementById("card-template");
    const chipTemplate = document.getElementById("chip-template");


    const newCard = cardTemplate.content.firstElementChild.cloneNode(true);
    newCard.querySelector('.card-title').prepend(itemData.title);
    newCard.querySelector('.edit-btn').addEventListener('click', (e) => {
        enterEditMode(newCard, itemData);

        // don't pass the click event further up the DOM
        e.stopPropagation();
    });


    if (itemData.tags) {
        const chipContainer = newCard.querySelector('.chips-wrapper');
        itemData.tags.forEach((tag) => {
            const newChip = chipTemplate.content.firstElementChild.cloneNode(true);
            newChip.innerText = tag;

            newChip.ariaLabel = 'Tag: ' + tag;

            chipContainer.appendChild(newChip);
        });
    }

    if (beforeElt) {
        cardContainer.insertBefore(newCard, beforeElt);
    } else {
        // we want to insert above the first item card, which might not be at index 0,
        // since there might be edit cards above
        const firstItem = cardContainer.querySelector('.item-card');
        cardContainer.insertBefore(newCard, firstItem);
    }

    initCard(newCard, itemData);
}

var items = [];

function reloadItems(followUpFunc=Function.prototype) {
    fetch(`https://picluster.a-h.wtf/${encodeURIComponent(url_root)}/api/v1/items?k=${encodeURIComponent(api_key)}`)
    .then((response) => {
        if (response.ok) {
            return response.json()
        }

        return Promise.reject(response);
    })
    .then((json) => {items = json})
    .then(() => clearItemCards())
    .then(() => items.forEach((elt) => addItemCard(elt)))
    .then(() => updateFilters())
    .then(followUpFunc)
    .catch((response) => {
        console.log('Error while fetching items:')
        console.log(response.status, response.statusText)
    })

}

reloadItems();


async function postItem(itemData) {
    const response = await fetch(
        `https://picluster.a-h.wtf/${encodeURIComponent(url_root)}/api/v1/items?k=${encodeURIComponent(api_key)}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                itemData: itemData
            })
        }
    );

    return response;
}

// postItem({
//   title: "TestTitle",
//   tags: ["Tag1", "Tag2"]
// })
// .then((response) => console.log(response))

async function deleteItem(itemId) {
    const response = await fetch(
        `https://picluster.a-h.wtf/${encodeURIComponent(url_root)}/api/v1/items/${encodeURIComponent(itemId)}?k=${encodeURIComponent(api_key)}`,
        {
            method: "DELETE"
        }
    );

    return response;
}

async function deleteAllDoneItems() {
    // get all done item IDs
    var doneIds = [];

    const cardContainer = document.getElementById('card-container');
    const cards = cardContainer.querySelectorAll('.item-card');

    for (const card of cards) {
        if (card.done) {
            doneIds.push(card.itemData.id);
        }
    }

    // aggregate the delete requests into a list
    const requests = doneIds.map((id) => deleteItem(id));
    // collect all async calls into a single Promise
    const result = await Promise.all(requests);

    return result;
}

// deleteItem("ca929b42-20b0-46c0-b3e2-82c37a5911a4")
// .then((response) => console.log(response))

async function updateItem(itemId, itemData) {
    const response = await fetch(
        `https://picluster.a-h.wtf/${encodeURIComponent(url_root)}/api/v1/items/${encodeURIComponent(itemId)}?k=${encodeURIComponent(api_key)}`,
        {
            method: "UPDATE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                itemData: itemData
            })
        }
    );

    return response;
}

async function collectAction(itemId, itemTitle, doneStatus) {
    if (!((url_root == 'einkaufsliste') || (url_root == 'einkaufsliste-stage'))) {  // only collect data in production and stage
        return;
    }

    var action_type = "CROSSED";

    if (!doneStatus) {
        action_type = "UNCROSSED";
    }

    const response = await fetch(
        `https://picluster.a-h.wtf/einkaufs_api/collect/`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                action_type: action_type,
                name: itemTitle,
                item_id: itemId,
                latitude: client_coords.latitude,
                longitude: client_coords.longitude,
                user_agent: window.navigator.userAgent,
                user_key: api_key
            })
        }
    );

    return response;
}

async function updateDone(itemId, doneStatus) {
    const response = await fetch(
        `https://picluster.a-h.wtf/${encodeURIComponent(url_root)}/api/v1/items/${encodeURIComponent(itemId)}/done?k=${encodeURIComponent(api_key)}`,
        {
            method: "UPDATE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                done: doneStatus
            })
        }
    );

    return response;
}

function initChips(parent, data=[]) {
  let autocomps = {};
  for (var tag of all_tags) {
    autocomps[tag] = null;
  }

  var elems = parent.querySelectorAll('.chips');
  var instances = M.Chips.init(elems, {
    placeholder: 'Tags',
    autocompleteOptions: {
      data: autocomps,
      limit: Infinity,
      minLength: 1
    },
    data: data,
    onChipAdd: function(e, chip) {
        // when a new tag is added, we add it to the temporary autocomplete list
        var newTag = this.chipsData[this.chipsData.length - 1].tag;

        // trim whitespace on new tag
        newTag = newTag.trim();
        // write it back to the data array
        this.chipsData[this.chipsData.length - 1].tag = newTag;
        
        // clone the tag list to temporarily assign the new tag (in case it will not be submitted)
        let tempAutos = Object.assign({}, autocomps);
        tempAutos[newTag] = null;
        this.autocomplete.updateData(tempAutos);
    }
  });
}


document.addEventListener('DOMContentLoaded', function() {
  var elems = document.querySelectorAll('.sidenav');
  var instances = M.Sidenav.init(elems);

  var elems = document.querySelectorAll('.chips');
  elems.forEach(initChips);

  var elems = document.querySelectorAll('.fixed-action-btn');
  var instances = M.FloatingActionButton.init(elems, {
    direction: 'left'
  });

  var elems = document.querySelectorAll('.modal');
  var instances = M.Modal.init(elems);

  var delAllBtn = document.getElementById('delAllBtn');
  delAllBtn.addEventListener('click', function() {
    deleteAllDoneItems()
        .then((res) => {
            reloadItems();
        });
  });

  var itemCards = document.querySelectorAll('.item-card');
  itemCards.forEach((card) => card.addEventListener('click', () => {
    toggleCardDone(card);
    updateDone(card.itemData.id, card.done);
    collectAction(card.itemData.id, card.itemData.title, card.done);
  }));

  const container = document.getElementById("card-container");
  const template = document.getElementById("edit-template");
  const addBtn = document.getElementById("add-btn");

  addBtn.addEventListener('click', function() {
    const newEditCard = template.content.firstElementChild.cloneNode(true);

    const nChildren = container.children.length;
    const newId = 'item-edit-' + (nChildren + 1)
    newEditCard.id = newId;

    container.prepend(newEditCard);

    const finishBtn = newEditCard.querySelector('.finish-edit');
    const cancelBtn = newEditCard.querySelector('.cancel-edit');

    finishBtn.enabled = true;
    finishBtn.addEventListener('click', function() {
        if (finishBtn.enabled) {
            finishBtn.enabled = false;
            finishEditing(newEditCard);
        }
    });

    cancelBtn.addEventListener('click', function() {
        removeEditCard(newEditCard);
    });

    initChips(newEditCard);

    scrollToTop();
  });


  window.addEventListener("focus", function() {
    if (navigator.onLine) {
      let scrollPos = getScrollPosition();
      reloadItems(() => {scrollToPosition(scrollPos.x, scrollPos.y)});
    }
  });
});


function finishEditing(editCard) {
    let title = editCard.querySelector('#item').value;

    let chipsInstance = M.Chips.getInstance(editCard.querySelector('.chips'));
    let remainingText = chipsInstance.el.querySelector('input').value;
    if (remainingText != "") {
        chipsInstance.el.querySelector('input').value = "";
        chipsInstance.addChip({tag: remainingText.trim()});
    }

    let tagsData = chipsInstance.chipsData;
    let tags = tagsData.map((elt) => elt.tag);

    let itemData = {
        title: title,
        tags: tags
    }

    postItem(itemData)
    .then(() => {
        removeEditCard(editCard);
        reloadItems();
    });
}

function clearItemCards() {
    document.querySelectorAll('.item-card').forEach((e) => e.remove());
}


function removeEditCard(editCard) {
    editCard.remove();
}

function enterEditMode(card, itemData) {
    const container = document.getElementById("card-container");

    // create edit card with delete button
    const newEditCard = createFromTemplate("edit-template");

    // create and add delete button
    const newDelBtn = createFromTemplate("delete-template");
    newDelBtn.addEventListener('click', function() {
        deleteItem(itemData.id);
        newEditCard.remove();
    })
    newEditCard.querySelector('.card-content').prepend(newDelBtn);

    // add functionality to card actions
    newEditCard.querySelector('.cancel-edit').addEventListener('click', function() {
        container.insertBefore(card, newEditCard);
        newEditCard.remove();
    });

    const finishBtn = newEditCard.querySelector('.finish-edit');
    finishBtn.enabled = true;
    finishBtn.addEventListener('click', function() {
        if (finishBtn.enabled) {
            finishBtn.enabled = false;

            // add any text that is still in the input as a tag
            let chipsInstance = M.Chips.getInstance(newEditCard.querySelector('.chips'));
            let remainingText = chipsInstance.el.querySelector('input').value;
            if (remainingText != "") {
                chipsInstance.el.querySelector('input').value = "";
                chipsInstance.addChip({tag: remainingText});
            }

            const newItemData = submitUpdate(newEditCard, itemData.id)
            addItemCard(newItemData, newEditCard);
            newEditCard.remove();
            updateFilters();
        }
    });

    // pre-fill edit card with values from itemData
    newEditCard.querySelector('#item').value = itemData.title;

    // attach edit card before present card
    container.insertBefore(newEditCard, card);

    // initialize tag chips with values from itemData
    initChips(newEditCard, itemData.tags.map((tag) => Object({tag: tag})))

    // remove present card
    card.remove()
}

function createFromTemplate(templateId) {
    const template = document.getElementById(templateId);
    const newElement = template.content.firstElementChild.cloneNode(true);

    return newElement;
}

function submitUpdate(editCard, itemId) {
    let title = editCard.querySelector('#item').value;
    let tagsData = M.Chips.getInstance(editCard.querySelector('.chips')).chipsData;
    let tags = tagsData.map((elt) => elt.tag);

    let itemData = {
        id: itemId,
        title: title,
        tags: tags,
        done: 0
    }

    updateItem(itemId, itemData);

    return itemData;
}

function scrollToTop() {
    scrollToPosition(0, 0);
}

function scrollToPosition(scrollX, scrollY) {
    window.scroll(scrollX, scrollY);
}

function getScrollPosition() {
    return {x: window.scrollX, y: window.scrollY}
}
