let onAuth = {}; loggedOut
let inventory = [];
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
let uiLoop;
let mouseReleaseTimer;
let isLeftMouseButtonPressed = false;
let autoSellList = [];
let stashPutTracker = { from: null, to: null };
let currentTooltipText = "";
var freeBlessings = 0;
var nextBlessingCost = 1;
var blessings = {};
var currentGold = 0;
var tooltips = {
    inventory: {},
    stash: {},
    selectedItems: {},
    blessings: {}
};
var loadedImages = [];
var totalPages = 1;
var oldTotalPages = 0;
var currentPage = 1;
const itemsPerPage = 50;
let previousInventoryState = {};
let previousStashState = {};
let previousSelectedItemsState = {};

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

function formatMoney(number) {
    return String(new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, notation: "compact", compactDisplay: "short" }).format(number));
}

function formatNumber(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function descriptionWithStats(item) {
    if (item.description === undefined)
        item.description = "none";

    var statsDescription = item.description;
    var reqLevel = false;

    if (item.levelRequirement !== undefined) {
        statsDescription += `<br><br>[REQUIRES LEVEL ${item.levelRequirement}]<br>`;
        reqLevel = true;
    }

    if (!reqLevel)
        statsDescription += '<br>';

    if (item.armorBonus >= 1.0) { //FORBIDDEN ARMOR
        statsDescription += '<br>FORBIDDEN ARMOR';
    } else if (item.armorBonus >= 0.8) { //LEGENDARY ARMOR
        statsDescription += '<br>LEGENDARY ARMOR';
    } else if (item.armorBonus >= 0.6) { //EPIC ARMOR
        statsDescription += '<br>EPIC ARMOR';
    } else if (item.armorBonus >= 0.4) { //EXTRAORDINARY ARMOR
        statsDescription += '<br>EXTRAORDINARY ARMOR';
    }

    if (item.damageBonus >= 1.0) { //FORBIDDEN DAMAGE
        statsDescription += '<br>FORBIDDEN DAMAGE';
    } else if (item.damageBonus >= 0.8) { //LEGENDARY DAMAGE
        statsDescription += '<br>LEGENDARY DAMAGE';
    } else if (item.damageBonus >= 0.6) { //EPIC DAMAGE
        statsDescription += '<br>EPIC DAMAGE';
    } else if (item.damageBonus >= 0.4) { //EXTRAORDINARY DAMAGE
        statsDescription += '<br>EXTRAORDINARY DAMAGE';
    }

    return statsDescription;
}

function formatDescription(item) {

    // Define the words and their corresponding colors, ensuring longer phrases come first
    const wordsToColor = [
        { word: 'extraordinary', color: '#2270AF' },
        { word: 'epic', color: '#7C337B' },
        { word: 'legendary', color: '#CCB333' },
        { word: 'forbidden', color: '#4B4A56' },
        { word: 'mana', color: 'lightblue' },
        { word: 'health', color: 'red' },
        { word: 'damage', color: '#ec8d34' },
        { word: 'damages', color: '#ec8d34' },
        { word: 'armor', color: '#20985d' },
        { word: 'one-hit', color: '#5C4033' }
    ];

    var description = descriptionWithStats(item);
    // Iterate over the words to color and replace them in the description
    wordsToColor.forEach(({ word, color }) => {
        const regex = new RegExp(word, 'gi'); // Create a case-insensitive regex
        description = description.replace(regex, match => `<span style="color: ${color};">${match}</span>`);
    });

    return description;
}

function formatGem(gem) {
    if (gem !== undefined) {
        try {
            const gemPercentage = parseInt(gem.description.match(/\d+/)[0]);
            return gem.name + " (+" + gemPercentage + "%)";
        } catch (error) {
            return gem.description;
        }
    } else {
        return "";
    }
}

function generateBlessingTooltip(blessing, total) {

    var blessingName;
    var image;
    var description;
    switch (blessing) {
      case "dex":
        blessingName = "Dexterity";
        image = 'images/attackSpeed.png';
        description = 'Increases your attack speed.';
        break;
      case "str":
        blessingName = "Strength";
        image = 'images/damage.png';
        description = 'Increases your physical damage.';
        break;
      case "def":
        blessingName = "Defense";
        image = 'images/armor.png';
        description = 'Increases your armor.';
        break;
      case "luck":
        blessingName = "Luck";
        image = 'images/luck.png';
        description = 'Increases your drop rate when killing monsters.';
        break;
      case "xp":
        blessingName = "XP Gain";
        image = 'images/xp.png';
        description = 'Increases your experience rate when killing monsters.';
        break;
    }
    
    blessingTooltip =
        `<div class="item-image" style='background-image: url("${image}");'></div>` +
        `<span style="font-size: 0.47vw;">${blessingName}</span><br>` +
        `<div style="margin-top:0.26vw;"/>`;

    blessingTooltip +=
        `${description}<br>` +
        `Current Blessings: ${total}<br>` +
        `Next Blessing Cost: ${abbreviateNumber(nextBlessingCost)}<br><br>` +
        `Click to buy 1 ${blessingName} blessing.`;

    return blessingTooltip;
}

function generateItemTooltip(item, image) {
    itemTooltip =
        `<div class="item-image" style='background-image: ${image};'></div>` +
        `<span style="font-size: 0.47vw;">${item.name}</span><br>` +
        `<div style="margin-top:0.26vw;"/>`;

    if (item.damage > 0) {
        if (item.gem !== undefined) {
            itemTooltip += `Base Damage: ${formatNumber(item.damage)}<br>`;
            itemTooltip += `Damage: ${formatNumber(Math.round(item.damage * (1 + (item.gem?.gemRank ?? 0) * 0.08)))}<br>`;
        }
        else
            itemTooltip += `Damage: ${formatNumber(Math.round(item.damage * (1 + (item.gem?.gemRank ?? 0) * 0.08)))}<br>`;
    }
    if (item.armor > 0) {
        if (item.gem !== undefined) {
            itemTooltip += `Base Armor: ${formatNumber(item.armor)}<br>`;
            itemTooltip += `Armor: ${formatNumber(Math.round(item.armor * (1 + (item.gem?.gemRank ?? 0) * 0.08)))}<br>`;
        }
        else
            itemTooltip += `Armor: ${formatNumber(Math.round(item.armor * (1 + (item.gem?.gemRank ?? 0) * 0.08)))}<br>`;
    }

    itemTooltip +=
        `Kind: ${item.kind}<br>` +
        `Gold Value: ${formatMoney(item.goldValue)}<br>` +
        `${item.critChance ? `Crit Chance: ${item.critChance}%<br>` : ''}` +
        `${item.critEffectiveness ? `Crit Effectiveness: ${item.critEffectiveness}%<br>` : ''}` +
        `${formatDescription(item)}<br>` +
        `${item.gem ? `Gem: ${formatGem(item.gem)}` : ''}`;

    return itemTooltip;
}

function addItemModifiers(item, itemElement) {
    let backgrounds = [];

    if (item.lock == true && (item.tradable == false || item.gem != undefined)) {
        backgrounds.push("url('images/inventory_background/locknon-tradable.png')");
    } else {
        if (item.lock == true) {
            backgrounds.push("url('images/inventory_background/lock.png')");
        }
        if (item.tradable == false || item.gem != undefined) {
            backgrounds.push("url('images/inventory_background/non-tradable.png')");
        }
    }

    if (item.armorBonus >= 1.0) { // FORBIDDEN ARMOR
        backgrounds.push("url('images/inventory_background/forbidden-armor.png')");
    } else if (item.armorBonus >= 0.8) { // LEGENDARY ARMOR
        backgrounds.push("url('images/inventory_background/legendary-armor.png')");
    } else if (item.armorBonus >= 0.6) { // EPIC ARMOR
        backgrounds.push("url('images/inventory_background/epic-armor.png')");
    } else if (item.armorBonus >= 0.4) { // EXTRAORDINARY ARMOR
        backgrounds.push("url('images/inventory_background/extraordinary-armor.png')");
    }

    if (item.damageBonus >= 1.0) { // FORBIDDEN DAMAGE
        backgrounds.push("url('images/inventory_background/forbidden-damage.png')");
    } else if (item.damageBonus >= 0.8) { // LEGENDARY DAMAGE
        backgrounds.push("url('images/inventory_background/legendary-damage.png')");
    } else if (item.damageBonus >= 0.6) { // EPIC DAMAGE
        backgrounds.push("url('images/inventory_background/epic-damage.png')");
    } else if (item.damageBonus >= 0.4) { // EXTRAORDINARY DAMAGE
        backgrounds.push("url('images/inventory_background/extraordinary-damage.png')");
    }

    if (item.shimmering === 1) { // SHINY ITEM
        backgrounds.push("url('images/inventory_background/shimmering.png')");
    }

    // If there are any backgrounds to apply, set them
    if (backgrounds.length > 0) {
        itemElement.style.backgroundImage = backgrounds.join(', ') + ', ' + itemElement.style.backgroundImage;
    }
}

function getImageName(item) {
    if (item.shimmering === 1) {
        return item.name.replace(/\s+/g, '') + "_shimmering";
    } else {
        return item.name.replace(/\s+/g, '');
    }
}

function styleItem(item, itemElement, isDefault = false) {
    // Check if itemElement already has a .item-amount element
    let amountDisplay = itemElement.querySelector('.item-amount');
    if (item.amount > 0) {
        if (!amountDisplay) {
            amountDisplay = document.createElement('div');
            amountDisplay.classList.add('item-amount');
            itemElement.appendChild(amountDisplay);
        }
        amountDisplay.classList.remove('item-amount-changed-up');
        amountDisplay.classList.remove('item-amount-changed-down');        
        void amountDisplay.offsetWidth;  
        if (item.changedAmount === 1) {
            amountDisplay.classList.add('item-amount-changed-up');
        } else if (item.changedAmount === -1) {
            amountDisplay.classList.add('item-amount-changed-down');
        }

        amountDisplay.innerHTML = formatItemAmount(item.amount);
    } else {
        if (amountDisplay) {
            itemElement.removeChild(amountDisplay);
        }
    }

    var imageName = getImageName(item);
    var _itemImagePath = "images/items/" + imageName + ".png";
    if (isDefault || loadedImages[imageName] === false) {
        _itemImagePath = "images/items/default.png";
    }

    if (item.gem != undefined) {
        let _gemImagePath = "images/items/" + item.gem.name.replace(/\s+/g, '') + ".gif";
        itemElement.style.backgroundImage = "url('" + _itemImagePath + "'), url('" + _gemImagePath + "')";
    } else {
        if (item.kind == "gem") {
            _itemImagePath = "images/items/" + item.name.replace(/\s+/g, '') + ".gif";
            itemElement.style.backgroundImage = "url('" + _itemImagePath + "')";
        } else {
            itemElement.style.backgroundImage = "url('" + _itemImagePath + "')";
        }
    }

    addItemModifiers(item, itemElement);

    itemElement.style.backgroundPosition = "center center, center center"; // Positions for each image
    itemElement.style.backgroundRepeat = "no-repeat, repeat"; // Repeat settings for each image
    // Size settings for each image (e.g., cover, contain, or explicit dimensions)
    itemElement.style.backgroundSize = "cover, contain";
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

function appendPaginationControls() {
    const stashInventoryContainer = document.getElementById('stashInventory');
    
    // Remove existing pagination controls if they exist
    const existingPaginationControls = document.querySelector('.stash-pagination');
    if (existingPaginationControls) {
        existingPaginationControls.remove();
    }

    // Create a div for pagination controls
    const paginationControls = document.createElement('div');
    paginationControls.classList.add('stash-pagination');

    // Create numbered buttons
    for (let page = 1; page <= 10; page++) {
        const pageButton = document.createElement('div');
        pageButton.classList.add('page-button');
        pageButton.innerText = page;
        pageButton.dataset.page = page;

        if (page <= totalPages) {
            if (page === currentPage) {
                pageButton.disabled = true;
                pageButton.classList.add('active');
            } else {
                pageButton.onclick = () => changePage(page);
            }
        } else {
            pageButton.classList.add('disabled');
            pageButton.disabled = true;
            pageButton.onclick = null;
            pageButton.title = "Buy more stash pages on the shop.";
        }

        paginationControls.appendChild(pageButton);
    }

    // Append pagination controls to the stash inventory container
    stashInventoryContainer.appendChild(paginationControls);

    // Now loop again to set the background image
    $('.stash-pagination .page-button').each(function(index) {
        var page = $(this).attr('data-page');

        if (page <= totalPages) {
            var firstCell = $('#stash-inventory-' + page + ' .inventory-row:first .inventory-cell:first');
            var firstInventoryItem = firstCell.find('.inventory-item:first');

            if (firstInventoryItem.length > 0) {
                var backgroundImage = firstInventoryItem.css('background-image');
                var urls = backgroundImage.match(/url\(["']?([^"']*)["']?\)/g);
                if (urls && urls.length > 0) {
                    var lastUrl = urls[urls.length - 1];
                    lastUrl = lastUrl.replace(/url\(["']?([^"']*)["']?\)/, '$1');
                    const pageImage = document.createElement('div');
                    pageImage.classList.add('page-image');
                    pageImage.style.backgroundImage = "url(" + lastUrl + ")";
                    this.innerText = "";
                    this.appendChild(pageImage);
                }
            }
        }
    });
}

function initExtension() {
    $(document).tooltip({
        track: true,
        content: function () {
            if ($(this).hasClass('bless-button')) { //Bless tooltip
                blessingType = $(this).attr('data-type');
                return tooltips['blessings'][blessingType] || ''; 
            }
            
            // Get location and position from data attributes
            if ($(this).attr('data-inventory-position') !== undefined) {
                type = 'inventory';
                position = $(this).attr('data-inventory-position');
            }
            else if ($(this).attr('data-stashposition') !== undefined) {
                type = 'stash';
                position = $(this).attr('data-stashposition');
            }
            else {
                type = 'selectedItems';
                position = $(this).attr('data-itemType');
            }
            // Fetch the tooltip content from the global tooltips object
            return tooltips[type][position] || '';
        },
        open: function (event, ui) {
            // Get the new tooltip text
            var newTooltipText = $(event.target).attr('data-ui-tooltip-content') || $(event.target).attr('title');

            // Compare with the current tooltip text
            if (newTooltipText === currentTooltipText) {
                // Prevent the new tooltip from opening if the text is the same
                event.preventDefault();
                //$('.ui-tooltip').not(ui.tooltip).remove();
            } else {
                // Update the current tooltip text
                currentTooltipText = newTooltipText;
                $('.ui-tooltip').not(ui.tooltip).remove();
            }
            contextMenu = $('.context-menu-list').length > 0;
            beingMoved = $(event.target).attr('moving');
            if (contextMenu || beingMoved) {
                event.preventDefault();
                $('.ui-tooltip').remove();
            }

            if (beingMoved) {
                currentTooltipText = "";
            }
        },
        close: function (event, ui) {
            // Clear the current tooltip text on close
            currentTooltipText = "";
        }
    });
    getInventory().then(() => {
        loadLoop = setInterval(() => {
            getInventory().catch(err => console.error('Failed to get inventory:', err));
        }, 2000);
        uiLoop = setInterval(() => {
            if (settingInventory){
                getUIInfo().catch(err => console.error('Failed to get UI Info:', err));
            }
        }, 1000);
        initializeContextMenu();
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

let tooltipTimeout;

$(document).on('mouseover', '.inventory-item', function () {
    clearTimeout(tooltipTimeout);
});

$(document).on('mouseout', '.inventory-item', function () {
    tooltipTimeout = setTimeout(() => {
        $('.ui-tooltip').remove();
    }, 2000);
});

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
        document.getElementById(`statsBars`).style.display = "none";
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
    $('.expandable').click(function() {
        var collapsibleElement = $(this).next('.collapsible');
        var isCurrentlyVisible = collapsibleElement.is(":visible");

        // Log the action based on current visibility
        if (isCurrentlyVisible) {
            if ($(this).is(':first-of-type')) {
                $(this).removeClass('top');
            } else {
                $(this).removeClass('full');
                $(this).addClass('bottom');
            }            
        } else {
            $(this).removeClass('bottom');
            if ($(this).is(':first-of-type')) {
                $(this).addClass('top');
            } else {
                $(this).addClass('full');
            }
        }

        // Toggle the visibility
        collapsibleElement.slideToggle();
    });
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
    var blessButtons = document.querySelectorAll('.bless-button');

    blessButtons.forEach(function (button) {
        button.addEventListener('click', function (event) {
            var blessingType = event.currentTarget.getAttribute('data-blessing');
            var type = event.currentTarget.getAttribute('data-type');
            event.currentTarget.classList.remove('blessed-success');
            event.currentTarget.classList.remove('blessed-fail');

            void event.currentTarget.offsetWidth; // Trigger reflow to restart the animation
            if (freeBlessings > 0 || nextBlessingCost <= currentGold){
                //updateBlessing(type, blessings[blessingType], true);
                //blessings[blessingType]++;
                event.currentTarget.classList.add('blessed-success');
                blessBlessing(blessingType);
            } else {
                event.currentTarget.classList.add('blessed-fail');
            }
        });
    });
});

// Helper function to check if an element is visible
function isElementVisible(element) {
    return element && getComputedStyle(element).display !== 'none';
}

document.addEventListener('contextmenu', function (event) {
    event.preventDefault();
    $('.ui-tooltip').remove();
    if (!event.target.closest('.inventory-item') || event.target.closest('#selectedInventory')) {
        $('.context-menu-list').trigger('contextmenu:hide');
    }
});

document.addEventListener('click', function (event) {
    $('.ui-tooltip').remove();
    // Array of selectors to check
    var selectors = ['#fullInventory', '#craftInventory', '#craftPreview', '#selectedInventory', '.context-menu-list', '#stashInventory', '#statsBars', '#stats', '#mission', '#blessings', '#blessBlessings', '.submenuSpan', '.stash-pagination', '.page-button', '.page-image', '#main-hud-container'];

    // Check if click is inside any specified and visible elements
    let isContextMenu = event.target.closest('.context-menu-list');
    let isSubContextMenu = event.target.closest('.osrsubmenu');
    for (var selector of selectors) {
        var closestElement = event.target.closest(selector);
        if (closestElement && isElementVisible(closestElement)) {
            if (closestElement != isContextMenu && closestElement != isSubContextMenu) {
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

function adjustPlayerFontSize() {
  const namePlate = document.getElementById('namePlate');
  const playerName = document.getElementById('playerName');

  let fontSize = parseFloat(window.getComputedStyle(playerName).fontSize);
  const namePlateWidth = namePlate.clientWidth - parseFloat(window.getComputedStyle(namePlate).paddingLeft) - parseFloat(window.getComputedStyle(namePlate).paddingRight);

  // Adjust the font size until the text fits within the namePlate
  while (playerName.scrollWidth > namePlateWidth && fontSize > 0) {
    fontSize -= 0.1;
    playerName.style.fontSize = fontSize + 'px';
  }
}

function updateBars(hp, maxHp, mana, maxMana, xp, maxXp) {
    const hpPercentage = (hp / maxHp) * 100;
    const manaPercentage = (mana / maxMana) * 100;
    const xpPercentage = (Math.floor(xp) / Math.floor(maxXp)) * 100;

    // Modify the widths of .progress inside hpBar/manaBar/xpBar
    document.querySelector('#hpBar .progress').style.width = `${hpPercentage}%`;
    document.querySelector('#manaBar .progress').style.width = `${manaPercentage}%`;
    document.querySelector('#xpBar .progress').style.width = `${xpPercentage}%`;

    // Update the text content for hp and mana
    document.querySelector('#hpBar .text').innerText = `${hp}/${maxHp}`;
    document.querySelector('#manaBar .text').innerText = `${mana}/${maxMana}`;
    document.querySelector('#xpBar .text').innerText = `${abbreviateNumber(xp)}/${abbreviateNumber(maxXp)}`;
}

function changePage(newPage) {
    // Check if the new page exists
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;

        // Hide all stash tables and show the current one
        for (let page = 1; page <= totalPages; page++) {
            const table = document.getElementById(`stash-inventory-${page}`);
            if (table) {
                table.style.display = page === currentPage ? 'block' : 'none';
            }
        }

        // Update pagination buttons
        const paginationButtons = document.querySelectorAll('.page-button');
        paginationButtons.forEach(button => {
            const page = parseInt(button.dataset.page, 10);
            if (page === currentPage) {
                button.classList.add('active');
                button.disabled = true;
                button.onclick = null; // Remove the onclick handler for the current page button
            } else {
                button.classList.remove('active');
                button.disabled = false;
                button.onclick = () => changePage(page); // Re-assign the onclick handler
            }
        });
    }
}

function capitalizeFirstLetter(string) {
  if (string.length === 0) return string;
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function updateBlessing(blessing, total, force = false){
    if (force){
        total = total + 1;
    }
    tooltips['blessings'][blessing] = generateBlessingTooltip(blessing, total);
    document.getElementById("blessing" + capitalizeFirstLetter(blessing)).innerHTML = total;
}

function updateUI(user){
    if (user === undefined){
        console.error('Error updating the UI');
        return;
    }
    let _stats = user.stats;
    let _mission = user.mission;

    if (user.metaData.hp !== undefined) {
        console.log('bars!!!');
        updateBars(user.metaData.hp, user.metaData.maxHp, user.metaData.mana, user.metaData.maxMana, _stats.xp, Math.floor((50 * (_stats.lvl ** 2))));
    }

    document.getElementById("statsLvl").innerText = "Level: " + _stats.lvl;
    document.getElementById("statsGold").innerText = abbreviateNumber(_stats.gold);
    document.getElementById("statsPremiumCurrency").innerText = _stats.premiumCurrency ?? 0;
    document.getElementById("statsDamage").innerText = abbreviateNumber(_stats.damage);
    document.getElementById("statsAttackSpeed").innerText = (_stats.attackSpeed ? _stats.attackSpeed + "/SEC" : 0);
    document.getElementById("statsArmor").innerText = abbreviateNumber(_stats.armor);
    document.getElementById("statsMagicResistance").innerText = abbreviateNumber(_stats.magicResistance ?? 0);

    document.getElementById("missionTitle").style.display = "block";
    document.getElementById("missionText").innerText = _mission.text;
    document.getElementById("missionProgress").innerText = "Progress: " + _mission.progress + "/" + _mission.maxProgress;

    let _totalBlessing = (user.blessings.damage + user.blessings.afkGain + user.blessings.armor + user.blessings.xpGain + user.blessings.goldGain + user.stats.freeBlessings);
    freeBlessings = user.stats.freeBlessings;
    nextBlessingCost = _totalBlessing ** 3 + 500;
    document.getElementById("next-blessing-cost").innerText = "Next bless: " + abbreviateNumber(nextBlessingCost);
    blessings = user.blessings;
    currentGold = user.stats.gold;

    updateBlessing("dex", user.blessings.afkGain);
    updateBlessing("str", user.blessings.damage);
    updateBlessing("def", user.blessings.armor);
    updateBlessing("luck", user.blessings.goldGain);
    updateBlessing("xp", user.blessings.xpGain);

    document.getElementById('playerName').innerText = `${user.username}`;
    adjustPlayerFontSize();
}

function createItemElement(itemObj, type) {
    const newItemElement = document.createElement('div');
    const item = itemObj.fullItem;
    const position = itemObj.position;
    newItemElement.className = `inventory-item ${item.name.replace(/\s+/g, '')}`;
    newItemElement.setAttribute('data-item-type', item.kind);
    newItemElement.setAttribute('data-fullItem', JSON.stringify(item));
    if (type === 'inventory') {
        newItemElement.setAttribute('data-inventory-position', position);
        newItemElement.removeAttribute('data-stashposition');
        newItemElement.removeAttribute('data-equipped');
    } else if (type === 'stash') {
        newItemElement.setAttribute('data-stashposition', position);
        newItemElement.removeAttribute('data-inventory-position');
        newItemElement.removeAttribute('data-equipped');
    } else if (type === 'selectedItems') {
        newItemElement.setAttribute('data-equipped', true);
        newItemElement.removeAttribute('data-inventory-position');
        newItemElement.removeAttribute('data-stashposition');
    }

    styleItem(item, newItemElement);
    tooltips[type][type === 'selectedItems' ? item.kind : position] = generateItemTooltip(item, newItemElement.style.backgroundImage);

    const imageName = getImageName(item);
    const imageExtension = (item.kind == "gem" ? 'gif' : 'png');
    const itemImagePath = `images/items/${imageName}.${imageExtension}`;
    if (loadedImages[imageName] === undefined) {
        checkImageExists(itemImagePath).then((exists) => {
            loadedImages[imageName] = exists;
            if (!exists) {
                styleItem(item, newItemElement, true);
                tooltips[type][type === 'selectedItems' ? item.kind : position] = generateItemTooltip(item, newItemElement.style.backgroundImage);
            }
        });
    }

    newItemElement.setAttribute('title', '');

    return newItemElement;
}

function updateItemElement(itemElement, itemObj, type) {
    const item = itemObj.fullItem;
    const position = itemObj.position;
    itemElement.className = `inventory-item ${item.name.replace(/\s+/g, '')}`;
    itemElement.setAttribute('data-item-type', item.kind);
    itemElement.setAttribute('data-fullItem', JSON.stringify(item));
    if (type === 'inventory') {
        itemElement.setAttribute('data-inventory-position', position);
        itemElement.removeAttribute('data-stashposition');
        itemElement.removeAttribute('data-equipped');
    } else if (type === 'stash') {
        itemElement.setAttribute('data-stashposition', position);
        itemElement.removeAttribute('data-inventory-position');
        itemElement.removeAttribute('data-equipped');
    } else if (type === 'selectedItems') {
        itemElement.setAttribute('data-equipped', true);
        itemElement.removeAttribute('data-inventory-position');
        itemElement.removeAttribute('data-stashposition');
    }

    item.changedAmount = itemObj.changedAmount;
    styleItem(item, itemElement);
    tooltips[type][type === 'selectedItems' ? item.kind : position] = generateItemTooltip(item, itemElement.style.backgroundImage);

    const imageName = getImageName(item);
    const imageExtension = (item.kind == "gem" ? 'gif' : 'png');
    const itemImagePath = `images/items/${imageName}.${imageExtension}`;
    if (loadedImages[imageName] === undefined) {
        checkImageExists(itemImagePath).then((exists) => {
            loadedImages[imageName] = exists;
            if (!exists) {
                styleItem(item, itemElement, true);
                tooltips[type][type === 'selectedItems' ? item.kind : position] = generateItemTooltip(item, itemElement.style.backgroundImage);
            }
        });
    }

    itemElement.setAttribute('title', '');
}

function removeItemElement(itemElement) {
    itemElement.remove();
}

const compareItems = (item1, item2) => {
    return item1.name === item2.name && 
           item1.damage === item2.damage && 
           item1.armor === item2.armor && 
           item1.goldValue === item2.goldValue && 
           item1.bonusDamage === item2.bonusDamage && 
           item1.bonusArmor === item2.bonusArmor && 
           item1.shimmering === item2.shimmering &&
           item1.lock === item2.lock &&
           item1.gem === item2.gem &&
           item1.amount === item2.amount;
};

function loadInventory(user, force = false) {
    const craftInventoryArray = getCraftInventoryArray();
    const craftImageElement = document.getElementById("craftImage");

    if (craftInventoryArray.some(item => item !== null) && document.querySelectorAll(".crafting")[0].style.display === "block") {
        let itemToCraft = findFirstCraftableItem(craftInventoryArray);
        if (itemToCraft) {
            const _imagePath = "./images/items/" + itemToCraft.name.replace(/\s+/g, '') + ".png";
            craftImageElement.style.backgroundImage = "url(" + _imagePath + ")";
            craftImageElement.setAttribute('title',
                `Name: ${itemToCraft.name}\n` +
                `Damage: ${Math.round(itemToCraft.damage * (1 + (itemToCraft.gem?.gemRank ?? 0) * 0.08))}\n` +
                `Armor: ${Math.round(itemToCraft.armor * (1 + (itemToCraft.gem?.gemRank ?? 0) * 0.08))}\n` +
                `Kind: ${itemToCraft.kind}\n` +
                `Gold Value: ${itemToCraft.goldValue}\n` +
                `Description: ${itemToCraft?.description || "nothing"}\n` +
                `Gem: ${itemToCraft?.gem?.name || 'none'}`
            );
        } else {
            craftImageElement.style.backgroundImage = "";
            craftImageElement.setAttribute('title', "");
        }
        return;
    } else {
        craftImageElement.style.backgroundImage = "";
        craftImageElement.setAttribute('title', "");
    }

    updateUI(user);
    
    if (isLeftMouseButtonPressed && !force) {
        return;
    }

    let inv = user.inventory;
    let _selectedItems = user.selectedItems;

    inventory = [];

    for (let i = 0; i < inv.length; i++) {
        let inventoryItem;
        if (inv[i].name != "empty") {
            inventoryItem = {
                position: i,
                fullItem: inv[i]
            };
        } else {
            inventoryItem = {};
        }

        inventory.push(inventoryItem);
    }

    const inventoryTable = document.getElementById('personal-inventory');
    for (let i = 0; i < inventory.length; i++) {
        const currentItem = inventory[i];
        const cell = inventoryTable.children[Math.floor(i / 5)].children[i % 5];
        const existingItemElement = cell.querySelector('.inventory-item');

        const prevItem = previousInventoryState[i] && previousInventoryState[i].fullItem ? previousInventoryState[i].fullItem : {};

        if (Object.keys(currentItem).length !== 0) {
            if (existingItemElement) {
                if (!compareItems(currentItem.fullItem, prevItem)) {
                    currentItem.changedAmount = currentItem.fullItem.amount > prevItem.amount ? 1 : currentItem.fullItem.amount < prevItem.amount ? -1 : 0;
                    updateItemElement(existingItemElement, currentItem, 'inventory');
                }
            } else {
                const newInventoryItem = createItemElement(currentItem, 'inventory');
                cell.appendChild(newInventoryItem);
            }
        } else if (existingItemElement) {
            existingItemElement.remove();
        }

        // Update the previous state for this item
        previousInventoryState[i] = {...currentItem};
    }

    // Handle Stash Inventory
    let stash = user.stash;
    let stashInventory = [];

    for (let i = 0; i < stash.length; i++) {
        let stashItem;
        if (stash[i].name != "empty") {
            stashItem = {
                position: i,
                fullItem: stash[i]
            };
        } else {
            stashItem = {};
        }

        stashInventory.push(stashItem);
    }

    totalPages = Math.ceil(stashInventory.length / itemsPerPage);

    const baseStashInventoryTable = document.getElementById('stash-inventory');
    if (totalPages != oldTotalPages){        
        baseStashInventoryTable.style.display = 'none';
        document.querySelectorAll('[id^="stash-inventory-"]').forEach(table => table.remove());
    }

    for (let page = 1; page <= totalPages; page++) {
        if (totalPages != oldTotalPages){
            const clonedStashInventoryTable = baseStashInventoryTable.cloneNode(true);
            clonedStashInventoryTable.id = `stash-inventory-${page}`;
            clonedStashInventoryTable.style.display = page === currentPage ? 'block' : 'none';
            baseStashInventoryTable.parentNode.appendChild(clonedStashInventoryTable);
        }
        const stashInventoryTable = document.getElementById(`stash-inventory-${page}`);

        const startIndex = ((page - 1) * itemsPerPage);
        const endIndex = startIndex + itemsPerPage;

        for (let i = startIndex; i < Math.min(endIndex, stashInventory.length); i++) {
            const currentItem = stashInventory[i];
            const pageIndex = i - startIndex;
            const rowIndex = Math.floor(pageIndex / 10);
            const colIndex = pageIndex % 10;

            const cell = stashInventoryTable.children[rowIndex].children[colIndex];
            const existingItemElement = cell.querySelector('.inventory-item');

            const prevItem = previousStashState[i] && previousStashState[i].fullItem ? previousStashState[i].fullItem : {};

            if (Object.keys(currentItem).length !== 0) {
                if (existingItemElement) {
                    if (!compareItems(currentItem.fullItem, prevItem)) {
                        currentItem.changedAmount = currentItem.fullItem.amount > prevItem.amount ? 1 : currentItem.fullItem.amount < prevItem.amount ? -1 : 0;
                        updateItemElement(existingItemElement, currentItem, 'stash');
                    }
                } else {
                    const newStashItem = createItemElement(currentItem, 'stash');
                    cell.appendChild(newStashItem);
                }
            } else if (existingItemElement) {
                existingItemElement.remove();
            }

            // Update the previous state for this item
            previousStashState[i] = {...currentItem};
        }
    }

    oldTotalPages = totalPages;

    if (user.username == "mantegudo" || user.username == "hydranime" || user.username == "onestreamrpg") {
        appendPaginationControls();
    }
    refreshSortableInventoryList();

    const selectedItemsContainer = document.getElementById("select-inventory");

    for (let item in _selectedItems) {
        if (_selectedItems.hasOwnProperty(item)) {
            if (item === "pet"){
                continue;
            }
            
            let currentItem = {
                position: null,
                fullItem: _selectedItems[item]
            }

            const cell = selectedItemsContainer.querySelector("#select-" + item);
            if (!cell)
                console.log('item error: ' + item);
            const existingItemElement = cell.querySelector('.inventory-item');

            const prevItem = previousSelectedItemsState[item] ? previousSelectedItemsState[item] : {};

            if (currentItem.fullItem.name !== "empty") {
                if (existingItemElement) {
                    if (!compareItems(currentItem.fullItem, prevItem)) {
                        currentItem.changedAmount = currentItem.fullItem.amount > prevItem.amount ? 1 : currentItem.fullItem.amount < prevItem.amount ? -1 : 0;
                        updateItemElement(existingItemElement, currentItem, 'selectedItems');
                    }
                } else {
                    const newSelectedItem = createItemElement(currentItem, 'selectedItems');
                    cell.appendChild(newSelectedItem);
                }
            } else if (existingItemElement) {
                existingItemElement.remove();
            }

            // Update the previous state for this item
            previousSelectedItemsState[item] = {...currentItem};
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
                            console.log('stashPut From Stash');
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
    let stashInventoryRows = [];
    for (let i = 1; i <= totalPages; i++) {
      const rows = document.querySelectorAll(`#stash-inventory-${i} .inventory-row`);
      stashInventoryRows = stashInventoryRows.concat(Array.from(rows));
    }
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
                        equipEmpty(item.kind, position - 1, true);
                        return;
                    }
                    if (stashInventoryItem.dataset.stashposition === undefined) {
                        const fromPos = stashInventoryItem.dataset.inventoryPosition;
                        const toPos = position - 1;
                        if (stashPutTracker.to instanceof String || stashPutTracker.to === null) {
                            stashPut(fromPos, toPos);
                            stashPutTracker = { from: fromPos, to: toPos };
                            console.log('stashPut From Inventory');
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

function getUIInfo(){
    return new Promise((resolve, reject) => {
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
            updateUI(data.user);
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
    });
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

function stashPutPage(position, page, fromStash) {
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

        fetch(myServer + '/stashPutPage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jwt: jwt,
                position: position,
                page: page,
                fromStash: fromStash,
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
                loadInventory(data.user, true);
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

function sellItem(slotNumber, isStash, item, amount = -1, callback = false) {
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
            item: item,
            amount: amount
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
            if (data.user.stats !== undefined){
                loadInventory(data.user, true);
                $('#delete-item').addClass('sold-item');
                setTimeout(() => {
                    $('#delete-item').removeClass('sold-item');
                }, 2000);
            } else {
                $('#delete-item').addClass('cannot-sell');
                setTimeout(() => {
                    $('#delete-item').removeClass('cannot-sell');
                }, 1500);
            }
            callback(data.user.stats !== undefined);
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

function initializeContextMenu() {
    $.contextMenu({
        selector: '.inventory-item',
        build: function ($trigger, e) {
            var fullItem = JSON.parse($trigger.attr('data-fullitem'));

            // Retrieving data attributes
            var inventoryPosition = $trigger.attr('data-inventory-position');
            var stashPosition = $trigger.attr('data-stashposition');

            var isStash;
            if (inventoryPosition !== undefined && inventoryPosition > -1) {
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

            var sellMenu;
            if (fullItem.amount !== undefined && fullItem.amount > 0) {
                sellMenu = {
                    name: "Sell Item",
                    disabled: fullItem && fullItem.lock,
                    className: "osrsubmenu",
                    items: {
                        "sellall": {
                            name: `All ${fullItem.amount} Items`,
                            className: "submenuSpan"
                        },
                        "sep6": {
                            type: "cm_separator"
                        },
                        "sellx": {
                            name: "Custom Amount",
                            type: "html",
                            html: `
                            <div class="custom-amount-menu">
                            <label>
                              <span>Custom Amount</span>
                              <div style="display: flex; align-items: center;">
                                <input type="number" value="1" min="1" max="${fullItem.amount}" name="context-menu-input-sellx" id="customAmountInput">
                                <div class="spin-buttons">
                                  <button class="spin-button up">▲</button>
                                  <button class="spin-button down">▼</button>
                                </div>
                                <button id="customAmountSell" style="margin-left: 0.26vw;" data-position="${position}" data-isstash="${isStash}" data-fullitem='${JSON.stringify(fullItem)}'>Sell</button>
                              </div>
                            </label>
                          </div>                        
                            `
                        }
                    }
                };
            } else {
                sellMenu = {
                    name: "Sell Item",
                    disabled: fullItem && fullItem.lock
                };
            }

            // Build the items object dynamically
            items = {
                "gem": {
                    name: "Remove Gem",
                    //icon: "fa-solid fa-gem",
                    visible: fullItem && fullItem.gem !== undefined && fullItem.gem !== "none"
                },
                "sep3": {
                    type: "cm_separator",
                    visible: fullItem && fullItem.gem !== undefined && fullItem.gem !== "none"
                },
                "lock": {
                    name: fullItem && fullItem.lock ? "Unlock Item" : "Lock Item",
                    //icon: fullItem && fullItem.lock ? "fa-solid fa-unlock" : "fa-solid fa-lock"
                },
                "sep2": "---------",
                "sell": sellMenu,
                "sep1": "---------",
                "autosell": {
                    name: fullItem && autoSellList.includes(fullItem.name) ? "Remove from Autosell" : "Add to Autosell",
                    //icon: "fa-solid fa-money-bill"
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
                callback: function (key, options) {
                    isLeftMouseButtonPressed = false;
                    // Accessing the triggering element
                    //var $trigger = options.$trigger;

                    // Retrieving data attributes
                    inventoryPosition = $trigger.attr('data-inventory-position');
                    stashPosition = $trigger.attr('data-stashposition');

                    var isStash;
                    if (inventoryPosition !== undefined && inventoryPosition > -1) {
                        position = inventoryPosition;
                        isStash = false;
                    } else {
                        position = stashPosition;
                        isStash = true;
                    }

                    fullItem = JSON.parse($trigger.attr('data-fullitem'));

                    // Additional logic based on the clicked menu item
                    switch (key) {
                        case "lock":
                            lock(position, isStash);
                            break;
                        case "autosell":
                            if (autoSellList.includes(fullItem.name)) {//remove from autosell
                                toggleAutoSell(fullItem.name, 'Remove');
                            } else {//add to autosell
                                toggleAutoSell(fullItem.name, 'Add');
                            }
                            break;
                        case "gem":
                            removeGem(position, isStash);
                            break;
                        case "sell":
                        case "sellall":
                            sellItem(position, isStash, fullItem);
                            break;
                        case "swap":
                            swapItem(position, isStash);
                            break;
                        case "cancel":
                            // Perform cancel action
                            break;
                    }
                },
                items: items
            };
        }
    });
}

$(document).on('click', '#customAmountSell', function () {
    $('.context-menu-list').trigger('contextmenu:hide');
    var position = parseInt($(this).attr('data-position'));
    var isStash = $(this).attr('data-isstash') === 'true';
    var fullItem = JSON.parse($(this).attr('data-fullitem'));
    sellItem(position, isStash, fullItem, $('#customAmountInput').val());
});

$(document).on('click', '.spin-button.up', function () {
    const $input = $('#customAmountInput');
    $input.val(parseInt($input.val()) + 1); // Increment the input value
});

$(document).on('click', '.spin-button.down', function () {
    const $input = $('#customAmountInput');
    $input.val(Math.max(parseInt($input.val()) - 1, $input.attr('min'))); // Decrement the input value, ensuring it doesn't go below the minimum value
});
