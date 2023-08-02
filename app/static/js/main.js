var all_tags = [];
updateTagList();

function updateTagList() {
    fetch(`https://picluster.a-h.wtf/einkaufsliste/api/v1/tags?k=${encodeURIComponent(api_key)}`)
      .then((response) => response.json())
      .then((json) => {all_tags = json.tags})
}

function initAllCards() {
  var itemCards = document.querySelectorAll('.item-card');
  itemCards.forEach(initCard);
}

function initCard(card) {
card.addEventListener('click', function() {
    this.classList.toggle('grey');
    this.classList.toggle('lighten-2');
    this.classList.toggle('grey-text');
    this.querySelector('.card-title').classList.toggle('line-through');
});
}

function addItemCard(itemData) {
    const cardContainer = document.getElementById('card-container');
    const cardTemplate = document.getElementById("card-template");
    const chipTemplate = document.getElementById("chip-template");


    const newCard = cardTemplate.content.firstElementChild.cloneNode(true);
    newCard.querySelector('.card-title').innerText = itemData.title;
    if (itemData.tags) {
        const chipContainer = newCard.querySelector('.chips-wrapper');
        itemData.tags.forEach((tag) => {
            const newChip = chipTemplate.content.firstElementChild.cloneNode(true);
            newChip.innerText = tag;
            chipContainer.appendChild(newChip);
        });
    }

    // we want to insert above the first item card, which might not be at index 0,
    // since there might be edit cards above
    const firstItem = cardContainer.querySelector('.item-card');
    cardContainer.insertBefore(newCard, firstItem);

    initCard(newCard);
}

var items = [];

fetch(`https://picluster.a-h.wtf/einkaufsliste/api/v1/items?k=${encodeURIComponent(api_key)}`)
.then((response) => {
    if (response.ok) {
        return response.json()
    }

    return Promise.reject(response);
})
.then((json) => {items = json})
.then(() => items.forEach(addItemCard))
.catch((response) => {
    console.log('Error while fetching items:')
    console.log(response.status, response.statusText)
})


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


function initChips(parent) {
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
  var instances = M.FloatingActionButton.init(elems);

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

    addItemCard(itemData);
    postItem(itemData);
    removeEditCard(editCard);
}


function removeEditCard(editCard) {
    editCard.remove();
}