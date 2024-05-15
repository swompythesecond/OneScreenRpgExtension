let onAuth = {}; loggedOut
let inventory = [];
const myServer = "https://germany.pauledevelopment.com:8051";
let hideMarkerTimer;
let emptyItem = {
    name: "empty",
    damage: 0,
    armor: 0,
    crystalLevel: 0,
    kind: "empty",
    sprite: 0,
}
let loadLoop;
let mouseReleaseTimer;
let isLeftMouseButtonPressed = false;
let autoSellList = [];
let stashPutTracker = { from: null, to: null };
let currentTooltipText = "";
var tooltips = {
  inventory: {},
  stash: {},
  selectedItems: {}
};

class RequestQueue {
    constructor() {
        this.queue = [];
        this.pendingPromise = false;
        this.currentAbortController = null;
        this.currentRequestType = null; // Store the type of the current request
    }

    // Add a new request to the queue
    enqueue(promiseFunction) {
        const functionName = promiseFunction.name || 'anonymous';
        return new Promise((resolve, reject) => {
            this.queue.push({
                promiseFunction,
                resolve,
                reject,
                type: functionName // Use the function name as the type
            });
            this.dequeue(); // Try processing the queue
        });
    }

    // Process the queue items
    dequeue() {
        if (this.pendingPromise || this.queue.length === 0) {
            return false;
        }
        const item = this.queue.shift();
        this.pendingPromise = true;
        this.currentAbortController = new AbortController(); // Create a new AbortController for this request
        this.currentRequestType = item.type; // Set the current request type
        const { signal } = this.currentAbortController;

        item.promiseFunction(signal)
            .then(value => {
                this.pendingPromise = false;
                this.currentAbortController = null; // Clear the abort controller after completion
                this.currentRequestType = null; // Clear the current request type
                item.resolve(value);
                this.dequeue(); // Process next item in the queue
            })
            .catch(err => {
                this.pendingPromise = false;
                this.currentAbortController = null; // Clear the abort controller after failure
                this.currentRequestType = null; // Clear the current request type
                item.reject(err);
                this.dequeue(); // Process next item in the queue
            });
    }

    // Clear the queue and abort requests of a specific type
    clear(type = null) {
        if (type) {
            // Clear specific type requests
            this.queue = this.queue.filter(item => item.type !== type);
            if (this.currentRequestType === type && this.currentAbortController) {
                this.currentAbortController.abort(); // Abort the current request if it matches the type
                this.pendingPromise = false;
                this.currentRequestType = null;
                this.currentAbortController = null; // Clear the current request details
                this.dequeue(); // Process the next item in the queue
            }
        } else {
            // Clear all requests
            if (this.currentAbortController) {
                this.currentAbortController.abort(); // Abort the current request
            }
            this.queue = [];
            this.pendingPromise = false;
            this.currentRequestType = null;
            this.currentAbortController = null; // Clear all current request details
        }
    }
}

const requestQueue = new RequestQueue();
var settingInventory = false;

//get json from server
let recipes;
fetch(myServer + '/recipes', {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
    },
})
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error(response.statusText);
        }
    }
    )
    .then(data => {
        recipes = data;
    })
    .catch(error => {
        console.error(error);
    });

var accessToken;
var connected = false;
if (localStorage.getItem('accessToken')) {
    connected = true;
    accessToken = localStorage.getItem('accessToken');
    removeLoggedOutElement();
    initExtension();
} else {
    connectToExtension();
}

//inventory fix


async function checkImageExists(imagePath) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);

        img.src = imagePath;
    });
}

//inventory fix
function scheduleNextInventoryCheck() {
    setTimeout(() => {
        getInventory().then(() => {
            scheduleNextInventoryCheck(); // Schedule the next check after the promise resolves
        }).catch(error => {
            console.error('Error retrieving inventory:', error);
            scheduleNextInventoryCheck(); // Even if there is an error, schedule the next check
        });
    }, 2000);
}


function formatItemAmount(amount) {
    if (amount <= 999) {
        return `${amount}`; // Return the amount as is if it's 999 or less
    } else {
        const thousands = Math.floor(amount / 1000);
        const remainder = amount % 1000;
        return `<span style="color : #FFD700;">${thousands}</span>\n${remainder.toString().padStart(3, '0')}`; // Pad the remainder with zeros
    }
}

function formatMoney(number){
    return String(new Intl.NumberFormat( 'en-US', { maximumFractionDigits: 1,notation: "compact" , compactDisplay: "short" }).format(number));
}

function formatNumber(number){
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDescription(text) {
  // Define the words and their corresponding colors, ensuring longer phrases come first
  const wordsToColor = [
    { word: 'extraordinary damage', color: 'gold' }, // darkyellow can be replaced with darkgoldenrod
    { word: 'extraordinary armor', color: 'gold' },  // darkyellow can be replaced with darkgoldenrod
    { word: 'mana', color: 'lightblue' },
    { word: 'health', color: 'red' },
    { word: 'armor', color: 'darkgreen' }
  ];

  // Iterate over the words to color and replace them in the text
  wordsToColor.forEach(({ word, color }) => {
    const regex = new RegExp(word, 'gi'); // Create a case-insensitive regex
    text = text.replace(regex, match => `<span style="color: ${color};">${match}</span>`);
  });

  return text;
}

function formatGem(gem){
    if (gem !== undefined){
        const gemPercentage = parseInt(gem.description.match(/\d+/)[0]);
        return gem.name + " (+" + gemPercentage + "%)";
    } else {
        return "";
    }
}

function connectToExtension() {
    window.Twitch.ext.onAuthorized(function (auth) {
        try {
            if (window.Twitch.ext.viewer.isLinked) {
                removeLoggedOutElement(); // Call the new function to remove the element
            } else {
                fullInventoryDivs.forEach(function (div) {
                    div.style.display = "none";
                });
                document.getElementById('hideInventory').style.display = "none";
            }
            initExtension();
        } catch (error) {
            initExtension();
        }
    });
}

// New function to remove the 'loggedOut' element
function removeLoggedOutElement() {
    let fullInventoryDivs = document.querySelectorAll(".hud");
    let element = document.getElementById('loggedOut');
    if (element) {
        element.remove();
    }
    fullInventoryDivs.forEach(function (div) {
        div.style.display = "block";
    });
    document.getElementById('hideInventory').style.display = "block";
}

function abbreviateNumber(value) {
    let newValue = value;
    if (value >= 1000) {
        const suffixes = ["", "k", "M", "B", "T"];
        const suffixNum = Math.floor(Math.log10(value) / 3);
        let shortValue = (value / Math.pow(1000, suffixNum));
        // Round to three significant figures
        shortValue = Number(shortValue.toPrecision(3));
        newValue = shortValue + suffixes[suffixNum];
    }
    return newValue;
}

function initExtension() {
    $(document).tooltip({
        track: true,
        content: function() {
            // Get location and position from data attributes
            if ($(this).data('inventoryPosition')){
                type = 'inventory';
                position = $(this).data('inventoryPosition');
            }
            else if ($(this).data('stashposition')){
                type = 'stash';
                position = $(this).data('stashposition');
            }
            else {
                type = 'selectedItems';
                position = $(this).data('itemType');
            }
            // Fetch the tooltip content from the global tooltips object
            return tooltips[type][position] || '';
        },
        open: function(event, ui) {
          // Get the new tooltip text
          var newTooltipText = $(event.target).data('ui-tooltip-content') || $(event.target).attr('title');
    
          // Compare with the current tooltip text
          if (newTooltipText === currentTooltipText) {
            // Prevent the new tooltip from opening if the text is the same
            event.preventDefault();
          } else {
            // Update the current tooltip text
            currentTooltipText = newTooltipText;
            $('.ui-tooltip').not(ui.tooltip).remove();
          }
        },
        close: function(event, ui) {
          // Clear the current tooltip text on close
          currentTooltipText = "";
        }
    });
    getInventory().then(() => {
        loadLoop = setInterval(() => {
            getInventory().catch(err => console.error('Failed to get inventory:', err));
        }, 2000);
    }).catch(error => {
        console.error('Initial inventory retrieval failed:', error);
        // Optionally start the interval even if the initial call fails
        loadLoop = setInterval(() => {
            getInventory().catch(err => console.error('Failed to get inventory:', err));
        }, 2000);
    });
}

function stopInventoryCheck() {
    clearInterval(loadLoop);
}

function restartInventoryCheck() {
    stopInventoryCheck(); // Ensure no duplicates
    loadLoop = setInterval(() => {
        getInventory().catch(err => console.error('Failed to get inventory:', err));
    }, 2000);
}

try {
    document.getElementById('share').addEventListener('click', (e) => {
        e.preventDefault();
        event.stopPropagation();
        window.Twitch.ext.actions.requestIdShare();
    });
}
catch (error) {
    console.log("Share button not found")
}





document.addEventListener('mousedown', function (event) {
    // Check if the left mouse button is pressed
    if (event.button === 0) {
        isLeftMouseButtonPressed = true;
        clearTimeout(mouseReleaseTimer);
    }
});

document.addEventListener('mouseup', function (event) {
    // Check if the left mouse button is released
    if (event.button === 0) {
        clearTimeout(mouseReleaseTimer);
        mouseReleaseTimer = setTimeout(setIsLeftMouseButtonPressedToFalse, 200)
    }
});

function setIsLeftMouseButtonPressedToFalse() {
    isLeftMouseButtonPressed = false;
}

document.querySelector("#craftButton").addEventListener("click", function () {
    event.stopPropagation();
    $('.context-menu-list').trigger('contextmenu:hide');
    jwt = window.Twitch.ext.viewer.sessionToken;
    const _item = findFirstCraftableItem(getCraftInventoryArray()).name;
    fetch(myServer + '/craftItem', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            accessToken: accessToken,
            item: _item,
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
            if (data.success == true) {
                const items = document.querySelectorAll('.inventory-item');
                items.forEach(item => {
                    item.parentNode.removeChild(item);
                });
                loadInventory(data.user, true)
            }
        })
        .catch(error => {
            console.error(error);
        });

});

document.querySelector("#hideInventory").addEventListener("click", function () {
    event.stopPropagation();
    $('.context-menu-list').trigger('contextmenu:hide');
    let fullInventoryDivs = document.querySelectorAll(".hud");

    if (fullInventoryDivs[0].style.display === "none") {
        fullInventoryDivs.forEach(function (div) {
            div.style.display = "block";
            let craftInventoryDivs = document.querySelectorAll(".crafting");
            craftInventoryDivs.forEach(function (div) {
                div.style.display = "none";
            });
            let stashInventoryDivs = document.querySelectorAll("#stashInventory");
            stashInventoryDivs.forEach(function (div) {
                div.style.display = "none";
            }
            );
        });
    } else {
        fullInventoryDivs.forEach(function (div) {
            div.style.display = "none";
        });
    }


});

// we need to do this because otherwise there are issues with html
window.addEventListener("DOMContentLoaded", function () {
    let craftInventoryDivs = document.querySelectorAll(".crafting");
    craftInventoryDivs.forEach(function (div) {
        div.style.display = "none";
    });
    let stashInventoryDivs = document.querySelectorAll("#stashInventory");
    stashInventoryDivs.forEach(function (div) {
        div.style.display = "none";
    }
    );
}, false);

document.querySelector("#craft").addEventListener("click", function () {
    event.stopPropagation();
    let craftInventoryDivs = document.querySelectorAll(".crafting");
    let stashInventoryDivs = document.querySelectorAll("#stashInventory");
    if (craftInventoryDivs[0].style.display === "none") {
        craftInventoryDivs.forEach(function (div) {
            div.style.display = "block";
        });
        stashInventoryDivs.forEach(function (div) {
            div.style.display = "none";
        });
    } else {
        craftInventoryDivs.forEach(function (div) {
            div.style.display = "none";
        });
    }
});

document.querySelector("#stash").addEventListener("click", function () {
    event.stopPropagation();
    $('.context-menu-list').trigger('contextmenu:hide');
    let stashInventoryDivs = document.querySelectorAll("#stashInventory");
    let craftInventoryDivs = document.querySelectorAll(".crafting");
    if (stashInventoryDivs[0].style.display === "none") {
        stashInventoryDivs.forEach(function (div) {
            div.style.display = "block";
        });
        craftInventoryDivs.forEach(function (div) {
            div.style.display = "none";
        });

    } else {
        stashInventoryDivs.forEach(function (div) {
            div.style.display = "none";
        });
    }
});


document.querySelector("#heal").addEventListener("click", function () {
    event.stopPropagation();
    $('.context-menu-list').trigger('contextmenu:hide');
    jwt = window.Twitch.ext.viewer.sessionToken;

    fetch(myServer + '/heal', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            accessToken: accessToken
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
        })
        .catch(error => {
            console.error(error);
        });
});

document.querySelector("#quit").addEventListener("click", function () {
    event.stopPropagation();
    $('.context-menu-list').trigger('contextmenu:hide');
    jwt = window.Twitch.ext.viewer.sessionToken;

    fetch(myServer + '/quit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            accessToken: accessToken
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
        })
        .catch(error => {
            console.error(error);
        });
});

function hideMarker() {
    let marker = document.getElementById('marker');
    marker.style.display = "none";
}

document.addEventListener('DOMContentLoaded', function () {
    var blessButtons = document.querySelectorAll('.blessButton');

    blessButtons.forEach(function (button) {
        button.addEventListener('click', function (event) {
            var blessingType = event.currentTarget.getAttribute('data-blessing');
            blessBlessing(blessingType);
        });
    });
});

// Helper function to check if an element is visible
function isElementVisible(element) {
    return element && getComputedStyle(element).display !== 'none';
}

document.addEventListener('contextmenu', function(event) {
    event.preventDefault();
    if (!event.target.closest('.inventory-item') || event.target.closest('#selectedInventory')) {
        $('.context-menu-list').trigger('contextmenu:hide');
    }
});

document.addEventListener('click', function (event) { 
    // Array of selectors to check
    var selectors = ['#fullInventory', '#craftInventory', '#craftPreview', '#selectedInventory', '.context-menu-list', '#stashInventory', '#statsBars', '#stats', '#mission', '#blessings', '#blessBlessings'];

    // Check if click is inside any specified and visible elements
    let isContextMenu = event.target.closest('.context-menu-list');
    for (var selector of selectors) {
        var closestElement = event.target.closest(selector);
        if (closestElement && isElementVisible(closestElement)) {
            if (closestElement != isContextMenu){
                $('.context-menu-list').trigger('contextmenu:hide');
            }
            return; // Exit the function if click is inside specified and visible elements
        }
    }

    $('.context-menu-list').trigger('contextmenu:hide');

    var percentX = (event.clientX / window.innerWidth) * 100;
    var percentY = (event.clientY / window.innerHeight) * 100;
    let marker = document.getElementById('marker');

    clearTimeout(hideMarkerTimer);
    hideMarkerTimer = setTimeout(hideMarker, 10000)
    marker.style.display = "block";
    marker.style.left = percentX + "%";
    marker.style.top = percentY + "%";
    jwt = window.Twitch.ext.viewer.sessionToken;
    fetch(myServer + '/setPosition', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            width: percentX,
            height: percentY,
            accessToken: accessToken
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
            if (data.event == "player not ingame") {
                clearTimeout(hideMarkerTimer)
                hideMarker();
                if (!window.Twitch.ext.viewer.isLinked && connected == false) {
                    spawnTextAtPosition("You need to share your id", data.width / 100, data.height / 100);
                }
                else {
                    spawnTextAtPosition("Player not ingame", data.width / 100, data.height / 100);
                }

            }
        })
        .catch(error => {
            console.error(error);
        });
});

function findFirstCraftableItem(craftingTable) {
    const inventory = {};
    craftingTable.forEach(item => {
        if (item && item.name) {
            inventory[item.name] = (inventory[item.name] || 0) + (item.amount || 1);
        }
    });

    // Step 2: Go through each recipe to check if it can be crafted
    for (let i = 0; i < recipes.length; i++) {
        const recipe = recipes[i];
        let canCraft = true;

        // Check if all components for the recipe are available in sufficient amounts
        Object.keys(recipe.recipe).forEach(component => {
            const requiredAmount = recipe.recipe[component];
            const availableAmount = inventory[component] || 0;

            if (availableAmount < requiredAmount) {
                canCraft = false;
            }
        });

        // Corrected part: Use Object.keys to iterate over keys of the inventory object
        Object.keys(inventory).forEach(key => {
            if (recipe.recipe[key] === undefined && recipe.recipe[key] !== inventory[key]) {
                canCraft = false;
            }
        });

        // If can craft, return the name of the item
        if (canCraft) {
            return recipe.item;
        }
    }

    // If no craftable item is found, return null or appropriate message
    return null;
}



function updateBars(hp, maxHp, mana, maxMana) {
    const hpPercentage = (hp / maxHp) * 100;
    const manaPercentage = (mana / maxMana) * 100;

    // Modify the widths of .barFill inside hpBar and manaBar
    document.querySelector('#hpBar .barFill').style.width = `${hpPercentage}%`;
    document.querySelector('#manaBar .barFill').style.width = `${manaPercentage}%`;

    // Update the text content for hp and mana
    document.getElementById('hpText').textContent = `${hp}/${maxHp}`;
    document.getElementById('manaText').textContent = `${mana}/${maxMana}`;
}

function loadInventory(user, force = false) {
    const craftInventoryArray = getCraftInventoryArray();
    if (craftInventoryArray.some(item => item !== null) && document.querySelectorAll(".crafting")[0].style.display === "block") {
        let itemToCraft = findFirstCraftableItem(craftInventoryArray);
        if (itemToCraft) {
            const _imagePath = "./images/items/" + itemToCraft.name.replace(/\s+/g, '') + ".png";
            let _element = document.getElementById("craftImage");
            _element.style.backgroundImage = "url(" + _imagePath + ")";
            _element.setAttribute('title',
                `Name: ${itemToCraft.name}\n` +
                `Damage: ${Math.round(itemToCraft.damage * (1 + (itemToCraft.gem?.gemRank ?? 0) * 0.08))}\n` +
                `Armor: ${Math.round(itemToCraft.armor * (1 + (itemToCraft.gem?.gemRank ?? 0) * 0.08))}\n` +
                `Kind: ${itemToCraft.kind}\n` +
                `Gold Value: ${itemToCraft.goldValue}\n` +
                `Description: ${itemToCraft?.description || "nothing"}\n` +
                `Gem: ${itemToCraft?.gem?.name || 'none'}`
            );
        }
        else {
            document.getElementById("craftImage").style.backgroundImage = "";
            document.getElementById("craftImage").setAttribute('title', "");
        }
        return;
    } else {
    }
    document.getElementById("craftImage").style.backgroundImage = "";
    document.getElementById("craftImage").setAttribute('title', "");

    if (isLeftMouseButtonPressed && !force) {
        //console.log("cant load inventory")
        return;
    }
    let inv = user.inventory;
    let _selectedItems = user.selectedItems;
    let _stats = user.stats;
    let _mission = user.mission;

    if (user.metaData.hp != undefined) {
        updateBars(user.metaData.hp, user.metaData.maxHp, user.metaData.mana, user.metaData.maxMana);
    }


    inventory = [];

    for (let i = 0; i < inv.length; i++) {
        let inventoryItem
        if (inv[i].name != "empty") {
            inventoryItem = {
                class: "inventory-item " + inv[i].name.replace(/\s+/g, ''),
                type: inv[i].kind,
                invPosition: i,
                fullItem: JSON.stringify(inv[i]),
                stats: inv[i]
            }
        }
        else {
            inventoryItem = {};
        }

        inventory.push(inventoryItem);
    }

    document.getElementById("statsLvl").innerText = "Level: " + abbreviateNumber(_stats.lvl);
    document.getElementById("statsXp").innerText = "XP: " + abbreviateNumber(Math.floor(_stats.xp)) + "/" + abbreviateNumber(Math.floor((50 * (_stats.lvl ** 2))));
    document.getElementById("statsGold").innerText = "Gold: " + abbreviateNumber(_stats.gold);
    document.getElementById("statsArmor").innerText = "Armor: " + abbreviateNumber(_stats.armor);
    document.getElementById("statsDamage").innerText = "Dmg: " + abbreviateNumber(_stats.damage);

    document.getElementById("missionTitle").style.display = "block";
    document.getElementById("missionText").innerText = _mission.text;
    document.getElementById("missionProgress").innerText = "Progress: " + _mission.progress + "/" + _mission.maxProgress;

    let _totalBlessing = (user.blessings.damage + user.blessings.afkGain + user.blessings.armor + user.blessings.xpGain + user.blessings.goldGain);
    let _totalBlessingsCost = _totalBlessing ** 3 + 500;
    document.getElementById("blessingDamage").innerText = "Dmg: " + user.blessings.damage + "(" + abbreviateNumber(_totalBlessingsCost) + "$)";
    document.getElementById("blessingAfkGain").innerText = "Salary: " + user.blessings.afkGain + "(" + abbreviateNumber(_totalBlessingsCost) + "$)";
    document.getElementById("blessingArmor").innerText = "Armor: " + user.blessings.armor + "(" + abbreviateNumber(_totalBlessingsCost) + "$)";
    document.getElementById("blessingGoldGain").innerText = "+XP: " + user.blessings.xpGain + "(" + abbreviateNumber(_totalBlessingsCost) + "$)";
    document.getElementById("blessingXpGain").innerText = "Luck: " + user.blessings.goldGain + "(" + abbreviateNumber(_totalBlessingsCost) + "$)";







    // Get all elements with class 'inventory-item'
    const items = document.querySelectorAll('.inventory-item');

    // Loop through each item and remove it
    items.forEach(item => {
        item.parentNode.removeChild(item);
    });

    // Get a reference to the inventory table
    const inventoryTable = document.getElementById('personal-inventory');
    // Loop through the inventory array and populate the inventory table
    for (let i = 0; i < inventory.length; i++) {
        // Get the current inventory item
        const currentItem = inventory[i];
        // If the current item is not empty, create a new inventory item div and add it to the inventory table
        if (Object.keys(currentItem).length !== 0) {
            const newInventoryItem = document.createElement('div');
            const classes = currentItem.class.split(' ');
            classes.forEach(className => newInventoryItem.classList.add(className));
            newInventoryItem.setAttribute('data-item-type', currentItem.type);
            newInventoryItem.setAttribute('data-inventory-position', currentItem.invPosition);
            newInventoryItem.setAttribute('data-fullItem', currentItem.fullItem);

            // Setting two background images classes[1] is the item name

            let _fullItem = JSON.parse(currentItem.fullItem);

            if (_fullItem.amount > 0) {
                const amountDisplay = document.createElement('div');
                amountDisplay.classList.add('item-amount');
                amountDisplay.innerHTML = formatItemAmount(_fullItem.amount);
                newInventoryItem.appendChild(amountDisplay);
            }
            _itemImagePath = "images/items/" + _fullItem.name.replace(/\s+/g, '') + ".png";
            if (_fullItem.gem != undefined) {
                _gemImagePath = "images/items/" + _fullItem.gem.name.replace(/\s+/g, '') + ".gif";
                newInventoryItem.style.backgroundImage = "url(" + _itemImagePath + "), url(" + _gemImagePath + ")";
            } else {
                if (_fullItem.kind == "gem") {
                    _itemImagePath = "images/items/" + _fullItem.name.replace(/\s+/g, '') + ".gif";
                    newInventoryItem.style.backgroundImage = "url(" + _itemImagePath + ")";
                }
                else {
                    newInventoryItem.style.backgroundImage = "url(" + _itemImagePath + ")";
                }

            }

            inventoryTooltipImage = newInventoryItem.style.backgroundImage;
            if (_fullItem.lock == true) {
                newInventoryItem.style.backgroundImage = "url('images/inventory_background/lock.png'), " + newInventoryItem.style.backgroundImage;
            }

            checkImageExists(_itemImagePath).then((exists) => {
                if (!exists) {
                    newInventoryItem.style.backgroundImage = "url('images/items/default.png')";
                    inventoryTooltipImage = "url('images/items/default.png')";
                }
            });


            newInventoryItem.style.backgroundPosition = "center center, center center"; // Positions for each image
            newInventoryItem.style.backgroundRepeat = "no-repeat, repeat"; // Repeat settings for each image
            // Size settings for each image (e.g., cover, contain, or explicit dimensions)
            newInventoryItem.style.backgroundSize = "cover, contain";

            // Set tooltip text with stats
            inventoryTooltip =
                `<div class="item-image" style='background-image: ${inventoryTooltipImage};'></div>` +
                `<span style="font-size: 9px;">${currentItem.stats.name}</span><br>` +
                `<div style="margin-top:5px;"/>`;

            if (currentItem.stats.damage > 0) {
                inventoryTooltip += `Base Damage/Damage: ${formatNumber(currentItem.stats.damage)}/${formatNumber(Math.round(currentItem.stats.damage * (1 + (currentItem.stats.gem?.gemRank ?? 0) * 0.08)))}<br>`;
            }
            if (currentItem.stats.armor > 0) {
                inventoryTooltip += `Base Armor/Armor: ${formatNumber(currentItem.stats.armor)}/${formatNumber(Math.round(currentItem.stats.armor * (1 + (currentItem.stats.gem?.gemRank ?? 0) * 0.08)))}<br>`;
            }

            inventoryTooltip +=
                `Kind: ${currentItem.stats.kind}<br>` +
                `Gold Value: ${formatMoney(currentItem.stats.goldValue)}<br>` +
                `Description: ${formatDescription(currentItem.stats?.description || "nothing")}<br>` +
                `${currentItem.stats?.gem ? `Gem: ${formatGem(currentItem.stats.gem)}` : ''}`;

            tooltips['inventory'][currentItem.invPosition] = inventoryTooltip;
            
            newInventoryItem.setAttribute('title', '');

            // If the corresponding div element is empty, append the new inventory item to it
            if (inventoryTable.children[Math.floor(i / 5)].children[i % 5].childElementCount === 0) {
                inventoryTable.children[Math.floor(i / 5)].children[i % 5].appendChild(newInventoryItem);
            }
            // If the corresponding div element is not empty, but the item is not present in the inventory array, remove the inventory item from the div element
            else if (!inventory.includes(currentItem)) {
                inventoryTable.children[Math.floor(i / 5)].children[i % 5].innerHTML = "";
            }
            // If the corresponding div element is not empty, and the item is present in the inventory array, replace its contents with the new inventory item
            else {
                inventoryTable.children[Math.floor(i / 5)].children[i % 5].replaceChild(newInventoryItem, inventoryTable.children[Math.floor(i / 5)].children[i % 5].firstChild);
            }
        }
        // If the current item is empty, remove any existing inventory item from the corresponding div element
        else {
            inventoryTable.children[Math.floor(i / 5)].children[i % 5].innerHTML = "";
        }
    }


    let stash = user.stash;

    let stashInventory = [];

    // Populate the stash inventory array
    for (let i = 0; i < stash.length; i++) {
        let stashItem;
        if (stash[i].name != "empty") {
            stashItem = {
                class: "inventory-item " + stash[i].name.replace(/\s+/g, ''),
                type: stash[i].kind,
                stashPosition: i,
                fullItem: JSON.stringify(stash[i]),
                stats: stash[i]
            };
        }
        else {
            stashItem = {};
        }

        stashInventory.push(stashItem);
    }

    // Get a reference to the stash inventory table
    const stashInventoryTable = document.getElementById('stash-inventory');
    // Loop through the stash inventory array and populate the stash inventory table
    for (let i = 0; i < stashInventory.length; i++) {
        const currentItem = stashInventory[i];
        if (Object.keys(currentItem).length !== 0) {
            const newStashItem = document.createElement('div');
            const classes = currentItem.class.split(' ');
            classes.forEach(className => newStashItem.classList.add(className));
            newStashItem.setAttribute('data-item-type', currentItem.type);
            newStashItem.setAttribute('data-stashposition', currentItem.stashPosition);
            newStashItem.setAttribute('data-fullItem', currentItem.fullItem);

            let _fullItem = JSON.parse(currentItem.fullItem);
            _itemImagePath = "images/items/" + _fullItem.name.replace(/\s+/g, '') + ".png";
            if (_fullItem.gem != undefined) {
                _gemImagePath = "images/items/" + _fullItem.gem.name.replace(/\s+/g, '') + ".gif";
                newStashItem.style.backgroundImage = "url(" + _itemImagePath + "), url(" + _gemImagePath + ")";
            } else {
                if (_fullItem.kind == "gem") {
                    _itemImagePath = "images/items/" + _fullItem.name.replace(/\s+/g, '') + ".gif";
                    newStashItem.style.backgroundImage = "url(" + _itemImagePath + ")";
                }
                else {
                    newStashItem.style.backgroundImage = "url(" + _itemImagePath + ")";
                }

            }

            stashTooltipImage = newStashItem.style.backgroundImage;
            if (_fullItem.lock == true) {
                newStashItem.style.backgroundImage = "url('images/inventory_background/lock.png'), " + newStashItem.style.backgroundImage;
            }

            checkImageExists(_itemImagePath).then((exists) => {
                if (!exists) {
                    newStashItem.style.backgroundImage = "url('images/items/default.png')";
                    stashTooltipImage = "url('images/items/default.png')";
                }
            });


            newStashItem.style.backgroundPosition = "center center, center center"; // Positions for each image
            newStashItem.style.backgroundRepeat = "no-repeat, repeat"; // Repeat settings for each image
            // Size settings for each image (e.g., cover, contain, or explicit dimensions)
            newStashItem.style.backgroundSize = "cover, contain";

            if (_fullItem.amount > 0) {
                const amountDisplay = document.createElement('div');
                amountDisplay.classList.add('item-amount');
                amountDisplay.innerHTML = formatItemAmount(_fullItem.amount);
                newStashItem.appendChild(amountDisplay);
            }

            // Add tooltip with item stats
            stashTooltip =
                `<div class="item-image" style='background-image: ${stashTooltipImage};'></div>` +
                `<span style="font-size: 9px;">${currentItem.stats.name}</span><br>` +
                `<div style="margin-top:5px;"/>`;

            if (currentItem.stats.damage > 0) {
                stashTooltip += `Base Damage/Damage: ${formatNumber(currentItem.stats.damage)}/${formatNumber(Math.round(currentItem.stats.damage * (1 + (currentItem.stats.gem?.gemRank ?? 0) * 0.08)))}<br>`;
            }
            if (currentItem.stats.armor > 0) {
                stashTooltip += `Base Armor/Armor: ${formatNumber(currentItem.stats.armor)}/${formatNumber(Math.round(currentItem.stats.armor * (1 + (currentItem.stats.gem?.gemRank ?? 0) * 0.08)))}<br>`;
            }

            stashTooltip +=
                `Kind: ${currentItem.stats.kind}<br>` +
                `Gold Value: ${formatMoney(currentItem.stats.goldValue)}<br>` +
                `Description: ${formatDescription(currentItem.stats?.description || "nothing")}<br>` +
                `${currentItem.stats?.gem ? `Gem: ${formatGem(currentItem.stats.gem)}` : ''}`;

            tooltips['stash'][currentItem.stashposition] = stashTooltip;

            newStashItem.setAttribute('title', '');

            // Position the item in the corresponding cell
            stashInventoryTable.children[Math.floor(i / 10)].children[i % 10].appendChild(newStashItem);
        }
        else {
            stashInventoryTable.children[Math.floor(i / 10)].children[i % 10].innerHTML = "";
        }
    }



    for (let item in _selectedItems) {
        if (_selectedItems.hasOwnProperty(item)) {
            let currentItem = _selectedItems[item];
            if (currentItem.name !== "empty") {
                let cell = document.getElementById("select-" + item);
                if (cell) {
                    var inventoryItem = document.createElement("div");
                    inventoryItem.className = "inventory-item " + currentItem.name.replace(/\s+/g, '');
                    inventoryItem.setAttribute("data-item-type", currentItem.kind);
                    inventoryItem.setAttribute('data-fullItem', JSON.stringify(currentItem));
                    inventoryItem.setAttribute('data-equipped', true);

                    //check if the gem even exists 
                    let _itemImagePath = "images/items/" + currentItem.name.replace(/\s+/g, '') + ".png";

                    if (currentItem.gem != undefined) {
                        // Use _itemImagePath for the item image, and create a path for the gem
                        let _gemImagePath = "images/items/" + currentItem.gem.name.replace(/\s+/g, '') + ".gif";
                        inventoryItem.style.backgroundImage = `url('${_itemImagePath}'), url('${_gemImagePath}')`;
                    } else {
                        // Use _itemImagePath directly if no gem is present
                        if (currentItem.kind == "gem") {
                            // Change the extension to .gif if the kind is gem
                            _itemImagePath = _itemImagePath.replace('.png', '.gif');
                        }
                        inventoryItem.style.backgroundImage = `url('${_itemImagePath}')`;
                    }
                    selectedItemsTooltipImage = inventoryItem.style.backgroundImage;

                    // Set tooltip text
                    selectedItemsTooltip =
                        `<div class="item-image" style='background-image: ${selectedItemsTooltipImage};'></div>` +
                        `<span style="font-size: 9px;">${currentItem.name}</span><br>` +
                        `<div style="margin-top:5px;"/>`;
        
                    if (currentItem.damage > 0) {
                        selectedItemsTooltip += `Base Damage/Damage: ${formatNumber(currentItem.damage)}/${formatNumber(Math.round(currentItem.damage * (1 + (currentItem.gem?.gemRank ?? 0) * 0.08)))}<br>`;
                    }
                    if (currentItem.armor > 0) {
                        selectedItemsTooltip += `Base Armor/Armor: ${formatNumber(currentItem.armor)}/${formatNumber(Math.round(currentItem.armor * (1 + (currentItem.gem?.gemRank ?? 0) * 0.08)))}<br>`;
                    }
        
                    selectedItemsTooltip +=
                        `Kind: ${currentItem.kind}<br>` +
                        `Gold Value: ${formatMoney(currentItem.goldValue)}<br>` +
                        `Description: ${formatDescription(currentItem.description || "nothing")}<br>` +
                        `${currentItem.gem ? `Gem: ${formatGem(currentItem.gem)}` : ''}`;
        
                    tooltips['selectedItems'][currentItem.kind] = selectedItemsTooltip;

                    inventoryItem.setAttribute('title', '');
                    
                    cell.appendChild(inventoryItem);
                }
            }
        }
    }


}

function getCraftInventoryArray() {
    const craftInventoryArray = [];
    const inventoryRows = document.querySelectorAll('#craft-inventory .inventory-row');

    inventoryRows.forEach(row => {
        const inventoryCells = row.querySelectorAll('.inventory-cell');
        inventoryCells.forEach(cell => {
            const inventoryItem = cell.querySelector('.inventory-item');
            if (inventoryItem && inventoryItem.dataset.fullitem) {
                try {
                    const itemData = JSON.parse(inventoryItem.dataset.fullitem);
                    craftInventoryArray.push(itemData);
                } catch (e) {
                    console.error('Error parsing item data:', e);
                    craftInventoryArray.push({ error: 'Invalid item data' });
                }
            } else {
                craftInventoryArray.push(null);
            }
        });
    });

    return craftInventoryArray;
}

function getInventoryArray() {
    const inventoryArray = [];
    const inventoryRows = document.querySelectorAll('#personal-inventory .inventory-row');
    let loop = 0;
    let allowSetInventory = true;

    inventoryRows.forEach((row, rowIndex) => {
        const inventoryCells = row.querySelectorAll('.inventory-cell');
        const numberOfColumns = inventoryCells.length;  // Assuming consistent number of columns per row
        inventoryCells.forEach((cell, cellIndex) => {
            const position = (rowIndex * numberOfColumns) + cellIndex + 1;  // Compute position
            const inventoryItem = cell.querySelector('.inventory-item');
            if (inventoryItem) {
                if (inventoryItem.dataset.fullitem !== undefined) {
                    let item = JSON.parse(inventoryItem.dataset.fullitem);
                    if (inventoryItem.dataset.stashposition !== undefined) {
                        const fromPos = position - 1;
                        const toPos = inventoryItem.dataset.stashposition;
                        if (stashPutTracker.from instanceof String || stashPutTracker.from === null) {
                            stashPut(fromPos, toPos);
                            stashPutTracker = { from: fromPos, to: toPos };
                            console.log('stashPut From Inventory');
                        }
                        allowSetInventory = false;
                        return { inventoryArray, allowSetInventory };
                    }
                    // We do this so we can unequip items
                    if (inventoryItem.dataset.inventoryPosition === undefined && document.getElementById("select-" + item.kind).innerHTML == '' && inventoryItem.dataset.moving === undefined) {
                        let equipEmptyTimer;
                        clearTimeout(equipEmptyTimer);
                        const _loop = loop;
                        allowSetInventory = false;
                        equipEmpty(item.kind, _loop, false);                        
                        return;
                    }
                    inventoryArray.push(item);
                } else {
                    inventoryArray.push(emptyItem);
                }
            } else {
                inventoryArray.push(emptyItem);
            }
            loop++;
        });
    });

    return { inventoryArray, allowSetInventory };
}



function getStashInventoryArray() {
    const stashInventoryArray = [];
    const stashInventoryRows = document.querySelectorAll('#stash-inventory .inventory-row');
    let loop = 0;
    let allowSetStash = true;

    stashInventoryRows.forEach((row, rowIndex) => {
        const stashInventoryCells = row.querySelectorAll('.inventory-cell');
        const numberOfColumns = stashInventoryCells.length;  // Assuming a consistent number of columns per row
        stashInventoryCells.forEach((cell, cellIndex) => {
            const position = (rowIndex * numberOfColumns) + cellIndex + 1;  // Compute position
            const stashInventoryItem = cell.querySelector('.inventory-item');
            if (stashInventoryItem) {
                if (stashInventoryItem.dataset.fullitem !== undefined) {
                    let item = JSON.parse(stashInventoryItem.dataset.fullitem);
                    if (stashInventoryItem.dataset.equipped && document.getElementById("select-" + item.kind).innerHTML == '') {
                        const _loop = loop;
                        allowSetStash = false;
                        equipEmpty(item.kind, position-1, true);
                        return;
                    }
                    if (stashInventoryItem.dataset.stashposition === undefined) {
                        const fromPos = stashInventoryItem.dataset.inventoryPosition;
                        const toPos = position - 1;
                        if (stashPutTracker.to instanceof String || stashPutTracker.to === null) {
                            stashPut(fromPos, toPos);
                            stashPutTracker = { from: fromPos, to: toPos };
                            console.log('stashPut From Stash');
                        }
                        allowSetStash = false;
                        return { stashInventoryArray, allowSetStash };
                    }
                    stashInventoryArray.push(item);
                } else {
                    stashInventoryArray.push(emptyItem);
                }
            } else {
                stashInventoryArray.push(emptyItem);
            }
        });
    });

    return { stashInventoryArray, allowSetStash };
}



function getSelectInventoryArray() {
    const selectInventoryArray = [];
    const selectInventoryRows = document.querySelectorAll('#select-inventory .inventory-row');

    selectInventoryRows.forEach(row => {
        const inventoryCells = row.querySelectorAll('.inventory-cell');
        inventoryCells.forEach(cell => {
            const inventoryItem = cell.querySelector('.inventory-item');
            if (inventoryItem) {
                let position = Number(inventoryItem.dataset.inventoryPosition);
                selectInventoryArray.push(position >= 0 ? position : -1);
                inventoryItem.dataset.inventoryPosition = -1;
            } else {
                selectInventoryArray.push(-1);
            }
        });
    });

    return selectInventoryArray;
}

function saveInventory() {
    let { inventoryArray, allowSetInventory } = getInventoryArray();
    const selectInventoryArray = getSelectInventoryArray();
    let { stashInventoryArray, allowSetStash } = getStashInventoryArray();

    if (allowSetInventory == true && allowSetStash == true) {
        setInventory(inventoryArray, selectInventoryArray, stashInventoryArray);
    }

    // Clear the stashPutTracker
    stashPutTracker = { from: null, to: null };
}

function getInventory() {
    return requestQueue.enqueue(() => new Promise((resolve, reject) => {
        jwt = window.Twitch.ext.viewer.sessionToken;

        if (jwt === undefined && accessToken === undefined) {
            reject("No session or token defined!");
            return;
        }

        fetch(myServer + '/getinventory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ jwt, accessToken })
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(response.statusText);
                }
            })
            .then(data => {
                document.getElementById('disconnectedMessage').style.display = 'none';
                autoSellList = data.user.autoSell;
                if (!settingInventory) {
                    loadInventory(data.user);
                }
                resolve(data); // Resolve the promise with the data when everything is successful
            })
            .catch(error => {
                console.error(error);
                let element = document.getElementById('loggedOut');
                if (!element) {
                    document.getElementById('disconnectedMessage').style.display = 'block';
                }
                reject(error); // Reject the promise when there's an error
            });
    }));
}

function setInventory(inventory, selectInventoryArray, stashInventoryArray) {
    isLeftMouseButtonPressed = false;
    settingInventory = true;
    stopInventoryCheck();
    requestQueue.clear('getInventory');
    return requestQueue.enqueue(() => new Promise((resolve, reject) => {
        jwt = window.Twitch.ext.viewer.sessionToken;

        if (jwt === undefined && accessToken === undefined) {
            reject("No session or token defined!");
            return;
        }

        fetch(myServer + '/setinventory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jwt: jwt,
                inventory: inventory,
                selectInventoryArray: selectInventoryArray,
                stashInventoryArray: stashInventoryArray,
                accessToken: accessToken
            }),
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(response.statusText);
                }
            })
            .then(data => {
                loadInventory(data.user);
                resolve(data); // Resolve the promise with the data when everything is successful
            })
            .catch(error => {
                console.error(error);
                reject(error); // Reject the promise when there's an error
            }).finally(() => {
                // Restart the inventory check interval 2 seconds after setInventory completes
                settingInventory = false;
                setTimeout(restartInventoryCheck, 2000);
            });
    }));
}



function stashPut(inventoryPosition, stashPosition) {
    isLeftMouseButtonPressed = false;
    settingInventory = true;
    stopInventoryCheck();
    requestQueue.clear('getInventory');
    return requestQueue.enqueue(() => new Promise((resolve, reject) => {
        jwt = window.Twitch.ext.viewer.sessionToken;

        if (jwt === undefined && accessToken === undefined) {
            reject("No session or token defined!");
            return;
        }

        fetch(myServer + '/stashPut', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jwt: jwt,
                stashPosition: stashPosition,
                inventoryPosition: inventoryPosition,
                accessToken: accessToken
            }),
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(response.statusText);
                }
            })
            .then(data => {
                loadInventory(data.user);
                resolve(data); // Resolve the promise with the data when everything is successful
            })
            .catch(error => {
                console.error(error);
                reject(error); // Reject the promise when there's an error
            }).finally(() => {
                // Restart the inventory check interval 2 seconds after stashPut completes
                settingInventory = false;
                setTimeout(restartInventoryCheck, 2000);
            });
    }));
}



function equipEmpty(_kind, _slot, _fromStash = false) {
    isLeftMouseButtonPressed = false;
    settingInventory = true;
    stopInventoryCheck();
    requestQueue.clear();
    return requestQueue.enqueue(() => new Promise((resolve, reject) => {
        jwt = window.Twitch.ext.viewer.sessionToken;

        if (jwt === undefined && accessToken === undefined) {
            reject("No session or token defined!");
            return;
        }

        fetch(myServer + '/equipEmpty', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jwt: jwt,
                kind: _kind,
                slot: _slot,
                fromStash: _fromStash,
                accessToken: accessToken
            }),
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
            loadInventory(data.user);
            resolve(data); // Resolve the promise with the data when everything is successful
        })
        .catch(error => {
            console.error(error);
            reject(error); // Reject the promise when there's an error
        }).finally(() => {
            // Restart the inventory check interval 2 seconds after stashPut completes
            settingInventory = false;
            setTimeout(restartInventoryCheck, 2000);
        });
    }));
}


function blessBlessing(kind) {
    event.stopPropagation();
    jwt = window.Twitch.ext.viewer.sessionToken;
    fetch(myServer + '/blessBlessings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            kind: kind,
            accessToken: accessToken
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
            loadInventory(data.user)
        })
        .catch(error => {
            console.error(error);
        });
}


function spawnTextAtPosition(text, xPercent, yPercent) {
    // Create a new text element
    const textElement = document.createElement('span');

    // Style the text element
    textElement.textContent = text;
    textElement.className = 'spawned-text';
    textElement.style.position = 'fixed';
    textElement.style.left = `${xPercent * 100}%`;
    textElement.style.top = `${yPercent * 100}%`;
    textElement.style.transform = 'translate(-50%, -50%)'; // Center the text based on x, y coordinates
    textElement.style.opacity = '1';
    textElement.style.transition = 'opacity 2s'; // Adjust the fade duration as needed
    textElement.style.zIndex = '1000'; // Make sure it appears on top of most elements
    textElement.style.pointerEvents = 'none'; // So it doesn't interfere with clicks on other elements

    // Append to the body
    document.body.appendChild(textElement);

    // Start the fade out
    setTimeout(() => {
        textElement.style.opacity = '0';
    }, 10); // Small delay to ensure the transition takes effect

    // Remove from the DOM after fading
    setTimeout(() => {
        textElement.remove();
    }, 2010); // Slightly longer than the fade duration to ensure it's fully faded before removal
}

//inventory context menu
function lock(slotNumber, isStash) {
    console.log('lock: ' + slotNumber + ' - isStash: ' + isStash);
    event.stopPropagation();
    jwt = window.Twitch.ext.viewer.sessionToken;
    fetch(myServer + '/lock', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            accessToken: accessToken,
            slotNumber: slotNumber,
            fromStash: isStash
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
            loadInventory(data.user, true)
        })
        .catch(error => {
            console.error(error);
        });
}

function toggleAutoSell(itemName, type) {
    event.stopPropagation();
    jwt = window.Twitch.ext.viewer.sessionToken;
    fetch(myServer + '/autosell' + type, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            accessToken: accessToken,
            itemName: itemName
        }),
    })
        .then(response => {
            if (response.ok) {
                //console.log(itemName + ' used /autosell' + type + ' endpoint successfully!');
            } else {
                throw new Error(response.statusText);
            }
        })
        .catch(error => {
            console.error(error);
        });
}

function sellItem(slotNumber, isStash, item) {
    event.stopPropagation();
    jwt = window.Twitch.ext.viewer.sessionToken;
    fetch(myServer + '/sell', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            accessToken: accessToken,
            slotNumber: slotNumber,
            fromStash: isStash,
            item: item
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
            loadInventory(data.user, true)
        })
        .catch(error => {
            console.error(error);
        });
}

function swapItem(slotNumber, isStash) {
    event.stopPropagation();
    jwt = window.Twitch.ext.viewer.sessionToken;
    fetch(myServer + '/stashPut', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            accessToken: accessToken,
            inventoryPosition: isStash ? -1 : slotNumber,
            stashPosition: isStash ? slotNumber : -1
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
            loadInventory(data.user, true)
        })
        .catch(error => {
            console.error(error);
        });
}

function removeGem(slotNumber, isStash) {
    event.stopPropagation();
    jwt = window.Twitch.ext.viewer.sessionToken;
    fetch(myServer + '/removeGem', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jwt: jwt,
            accessToken: accessToken,
            slotNumber: slotNumber,
            fromStash: isStash
        }),
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(response.statusText);
            }
        })
        .then(data => {
            loadInventory(data.user, true)
        })
        .catch(error => {
            console.error(error);
        });
}

$.contextMenu({
    selector: '.inventory-item',
    build: function($trigger, e) {
        var fullItem = $trigger.data('fullitem');

        // Retrieving data attributes
        var inventoryPosition = $trigger.data('inventory-position');
        var stashPosition = $trigger.data('stashposition');
    
        var isStash;
        if (inventoryPosition !== undefined && inventoryPosition > -1){
            position = inventoryPosition;
            isStash = false;
        } else {
            position = stashPosition;
            isStash = true;
        }
        
        var isInsideSelectedInventory = $trigger.closest('#selectedInventory').length > 0;

        // Prevent showing the menu if inside #selectedInventory
        if (isInsideSelectedInventory) {
            return false;
        }

        // Build the items object dynamically
        var items = {
            "lock": {
                name: fullItem && fullItem.lock ? "Unlock Item" : "Lock Item",
                //icon: fullItem && fullItem.lock ? "fa-solid fa-unlock" : "fa-solid fa-lock"
            },
            "sep1": "---------",
            "autosell": {
                name: fullItem && autoSellList.includes(fullItem.name) ? "Remove from Autosell" : "Add to Autosell",
                //icon: "fa-solid fa-money-bill"
            },
            "sep2": "---------",
            "gem": {
                name: "Remove Gem",
                //icon: "fa-solid fa-gem",
                visible: fullItem && fullItem.gem !== undefined && fullItem.gem !== "none"
            },
            "sep3": {
                type: "cm_separator",
                visible: fullItem && fullItem.gem !== undefined && fullItem.gem !== "none"
            },
            "sell": {
                name: "Sell Item",
                //icon: "fa-solid fa-coins",
                disabled: fullItem && fullItem.lock
            },
            "sep4": "---------",
            "swap": {
                name: isStash ? "Send to Inventory" : "Send to Stash",
                //icon: "fa-solid fa-right-left"
            },
            "sep5": "---------",
            "cancel": {
                name: "Cancel",
                //icon: function() {
                //    return 'context-menu-icon context-menu-icon-quit';
                //}
            }
        };

        return {
            callback: function(key, options) {
                isLeftMouseButtonPressed = false;
                // Accessing the triggering element
                var $trigger = options.$trigger;
        
                // Retrieving data attributes
                var inventoryPosition = $trigger.data('inventory-position');
                var stashPosition = $trigger.data('stashposition');

                var isStash;
                if (inventoryPosition !== undefined && inventoryPosition > -1){
                    position = inventoryPosition;
                    isStash = false;
                } else {
                    position = stashPosition;
                    isStash = true;
                }
                
                var fullItem = $trigger.data('fullitem');
        
                // Additional logic based on the clicked menu item
                switch(key) {
                    case "lock":
                        lock(position, isStash);
                        break;
                    case "autosell":
                        if (autoSellList.includes(fullItem.name)){//remove from autosell
                            toggleAutoSell(fullItem.name, 'Remove');
                        } else {//add to autosell
                            toggleAutoSell(fullItem.name, 'Add');
                        }
                        break;
                    case "gem":
                        removeGem(position, isStash);
                        break;
                    case "sell":
                        sellItem(position, isStash, fullItem);
                        break;
                    case "swap":
                        swapItem(position, isStash);
                        break;
                    case "cancel":
                        console.log("Action canceled.");
                        // Perform cancel action
                        break;
                }
            },
            items: items
        };
    }
});
