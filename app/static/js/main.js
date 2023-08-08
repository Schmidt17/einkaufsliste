var all_tags = [];
updateTagList();

// var doneEventSource = new EventSource(`https://picluster.a-h.wtf/einkaufsliste/api/v1/done/stream?k=${encodeURIComponent(api_key)}`);
// doneEventSource.onmessage = function(e) {
//     console.log(e.data);
// }

// configuration for the connection to the MQTT broker
const mqtt_host = "broker.hivemq.com";
const mqtt_port = 8884;
// The client name comprises a generic prefix that describes the type of client
// and a suffix that makes it unique, to allow multiple instances of the same client type to connect.
// Prefix and suffix are joined with an underscore.
// const client_prefix = "web-elm";
// To generate the unique suffix, the current client time with millisecond precision is used.
// In the unlikely case that a name collision still occurs, reloading some time later will likely succeed.
// const client_unique_suffix = String(moment().unix()) + String(moment().milliseconds());
// const client_name = client_prefix + "_" + client_unique_suffix;
var topic = "einkaufsliste_doneUpdates";

// create a MQTT client instance
const client = new Paho.MQTT.Client(mqtt_host, mqtt_port, "");

// variables to store actions that can be defined by the user
var connectFollowUpAction = function() {};
var connectionLostFollowUpAction = function() {};

// set callback functions
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = function (message) {
    msgObj = JSON.parse(message.payloadString);

    const card = getCardByItemId(msgObj.id);

    if ((card != null) & (card.done != msgObj.status)) {
        card.classList.toggle('grey');
        card.classList.toggle('lighten-2');
        card.classList.toggle('grey-text');
        card.querySelector('.card-title').classList.toggle('line-through');

        if (card.done) {
            card.done = 0;
        } else {
            card.done = 1;
        }
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
    fetch(`https://picluster.a-h.wtf/einkaufsliste/api/v1/tags?k=${encodeURIComponent(api_key)}`)
      .then((response) => response.json())
      .then((json) => {all_tags = json.tags})
      .then(() => populateFilterTags())
}


function populateFilterTags() {
    const chipContainer = document.querySelector('.filter-chips');
    // remove all current chips
    chipContainer.querySelectorAll('.chip').forEach((e) => e.remove());

    // add the new chips
    all_tags.forEach((tag) => {
        const newChip = createFromTemplate('chip-template');
        newChip.innerText = tag;
        newChip.addEventListener('click', function() {
            this.classList.toggle('darken-1')
            this.classList.toggle('white-text')
        })

        chipContainer.appendChild(newChip);
    });
}


function initCard(card, itemData) {
    card.done = itemData.done;
    card.itemData = itemData;

    if (card.done) {
        card.classList.add('grey');
        card.classList.add('lighten-2');
        card.classList.add('grey-text');
        card.querySelector('.card-title').classList.add('line-through');
    }

    card.addEventListener('click', function() {
        this.classList.toggle('grey');
        this.classList.toggle('lighten-2');
        this.classList.toggle('grey-text');
        this.querySelector('.card-title').classList.toggle('line-through');

        if (this.done) {
            this.done = 0;
        } else {
            this.done = 1;
        }

        updateDone(this.itemData.id, this.done);

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

function reloadItems() {
    fetch(`https://picluster.a-h.wtf/einkaufsliste/api/v1/items?k=${encodeURIComponent(api_key)}`)
    .then((response) => {
        if (response.ok) {
            return response.json()
        }

        return Promise.reject(response);
    })
    .then((json) => {items = json})
    .then(() => items.forEach((elt) => addItemCard(elt)))
    .catch((response) => {
        console.log('Error while fetching items:')
        console.log(response.status, response.statusText)
    })

}

reloadItems();


async function postItem(itemData) {
    const response = await fetch(
        `https://picluster.a-h.wtf/einkaufsliste/api/v1/items?k=${encodeURIComponent(api_key)}`,
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
        `https://picluster.a-h.wtf/einkaufsliste/api/v1/items/${encodeURIComponent(itemId)}?k=${encodeURIComponent(api_key)}`,
        {
            method: "DELETE"
        }
    );

    return response;
}

// deleteItem("ca929b42-20b0-46c0-b3e2-82c37a5911a4")
// .then((response) => console.log(response))

async function updateItem(itemId, itemData) {
    const response = await fetch(
        `https://picluster.a-h.wtf/einkaufsliste/api/v1/items/${encodeURIComponent(itemId)}?k=${encodeURIComponent(api_key)}`,
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

async function updateDone(itemId, doneStatus) {
    const response = await fetch(
        `https://picluster.a-h.wtf/einkaufsliste/api/v1/items/${encodeURIComponent(itemId)}/done?k=${encodeURIComponent(api_key)}`,
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

  var itemCards = document.querySelectorAll('.item-card');
  itemCards.forEach((card) => card.addEventListener('click', function() {
        this.classList.toggle('grey');
        this.classList.toggle('lighten-2');
        this.classList.toggle('grey-text');
        this.querySelector('.card-title').classList.toggle('line-through');
      })
  );

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

    finishBtn.addEventListener('click', function() {
        finishEditing(newEditCard);
    });

    cancelBtn.addEventListener('click', function() {
        removeEditCard(newEditCard);
    });

    initChips(newEditCard);
  });

});


function finishEditing(editCard) {
    let title = editCard.querySelector('#item').value;
    let tagsData = M.Chips.getInstance(editCard.querySelector('.chips')).chipsData;
    let tags = tagsData.map((elt) => elt.tag);

    let itemData = {
        title: title,
        tags: tags
    }

    postItem(itemData)
    .then(() => {
        removeEditCard(editCard);
        clearItemCards();
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

    newEditCard.querySelector('.finish-edit').addEventListener('click', function() {
        const newItemData = submitUpdate(newEditCard, itemData.id)
        addItemCard(newItemData, newEditCard);
        newEditCard.remove();
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