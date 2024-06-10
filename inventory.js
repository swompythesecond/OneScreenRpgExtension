"use strict";
let saveInventoryTimer;

jQuery.fn.extend({
    addRemoveItems: function (targetCount) {
        return this.each(function () {
            var $children = $(this).children();
            var rowCountDifference = targetCount - $children.length;
            ////console.log('row count diff: ' + rowCountDifference);

            if (rowCountDifference > 0) {
                // Add items
                for (var i = 0; i < rowCountDifference; i++) {
                    ////console.log($rows.first());
                    $children.last().clone().appendTo(this);
                }
            }
            else if (rowCountDifference < 0) {
                // remove items
                $children.slice(rowCountDifference).remove();
            }
        });
    },
    // Modified and Updated by MLM
    // Origin: Davy8 (http://stackoverflow.com/a/5212193/796832)
    parentToAnimate: function (newParent, duration, hidden = false) {
        duration = duration || 'slow';

        var $element = $(this);
        ////console.log($element);
        if ($element.length > 0) {

            newParent = $(newParent); // Allow passing in either a JQuery object or selector
            var oldOffset = $element.offset();
            $(this).appendTo(newParent);
            var newOffset = $element.offset();


            var temp = $element.clone().appendTo('body');

            temp.css({
                'position': 'absolute',
                'left': oldOffset.left,
                'top': oldOffset.top,
                'zIndex': 1000
            });

            $element.hide();

            temp.animate({
                'top': newOffset.top,
                'left': newOffset.left
            }, duration, function () {
                if (!hidden){
                    $element.show();
                    temp.remove();
                }                
            });

            ////console.log("parentTo Animate done");
        }
    }
});

$('#row-count').on('input propertychange change', function () {
    var targetRowCount = $(this).val();
    ////console.log('target count: ' + targetRowCount);
    $('label[for="' + $(this).attr('id') + '"]').html(targetRowCount);

    $('#personal-inventory.inventory-table').addRemoveItems(targetRowCount);

    refreshSortableInventoryList();
}).trigger('change');

$('#column-count').on('input propertychange change', function () {
    var targetColumnCount = $(this).val();
    ////console.log('target count: ' + targetColumnCount);
    $('label[for="' + $(this).attr('id') + '"]').html(targetColumnCount);

    $('#personal-inventory.inventory-table .inventory-row').addRemoveItems(targetColumnCount);

    refreshSortableInventoryList();
}).trigger('change');

function preventAnimationWhenMoving(senderItemElement, receiverItemElement){
    if ($(senderItemElement).hasClass('inventory-item')){
        var inventoryPosition = senderItemElement.attr('data-inventory-position');
        var stashPosition = senderItemElement.attr('data-stashposition');

        if (inventoryPosition !== undefined && inventoryPosition > -1) {
            if (previousInventoryState[inventoryPosition] && previousInventoryState[inventoryPosition].fullItem !== undefined)
                previousInventoryState[inventoryPosition].fullItem.swapped = true;
        } else {
            if (previousStashState[stashPosition] && previousStashState[stashPosition].fullItem !== undefined)
                previousStashState[stashPosition].fullItem.swapped = true;
        }                        
    }
    if ($(receiverItemElement).hasClass('inventory-item')){
        var inventoryPosition = receiverItemElement.attr('data-inventory-position');
        var stashPosition = receiverItemElement.attr('data-stashposition');
        
        if (inventoryPosition !== undefined && inventoryPosition > -1) {
            if (previousInventoryState[inventoryPosition] && previousInventoryState[inventoryPosition].fullItem !== undefined)
                previousInventoryState[inventoryPosition].fullItem.swapped = true;
        } else {
            if (previousStashState[stashPosition] && previousStashState[stashPosition].fullItem !== undefined)
                previousStashState[stashPosition].fullItem.swapped = true;
        }
    }
}


// Sorting, dragging, dropping, etc
var droppingOnPage = false;

refreshSortableInventoryList();
function refreshSortableInventoryList() {
    $('.inventory-cell').sortable({
        connectWith: ['.inventory-cell', '.page-button'],
        placeholder: 'inventory-item-sortable-placeholder',
        sort: function(event, ui) {
            //
        },
        start: function(event, ui) {
            $(this).attr('moving', 'true');
            //$('.ui-tooltip').remove();
            $(document).tooltip("disable");

            var senderItemElement = ui.item;
            var senderDataFullItem = senderItemElement.attr('data-fullitem');
            var senderIsEquipped = senderItemElement.attr('data-equipped');
            var senderData = JSON.parse(senderDataFullItem);
            var correctSlot = document.querySelector('#select-' + senderData.kind);
            if (correctSlot && !senderIsEquipped){
                correctSlot.classList.add('highlight-slot');
            }
        },
        stop: function(event, ui) {
            $(this).removeAttr('moving');
            $(ui.sender).removeAttr('moving');
            $(document).tooltip("enable");
            initTooltips();
            var senderItemElement = ui.item;
            var senderDataFullItem = senderItemElement.attr('data-fullitem');
            var senderIsEquipped = senderItemElement.attr('data-equipped');
            var senderData = JSON.parse(senderDataFullItem);
            var correctSlot = document.querySelector('#select-' + senderData.kind);
            if (correctSlot && !senderIsEquipped){
                correctSlot.classList.remove('highlight-slot');
            }
        },
        receive: function (event, ui) {        
            var attrWhitelist = $(this).attr('data-item-filter-whitelist');
            var attrBlackList = $(this).attr('data-item-filter-blacklist');
            var itemFilterWhitelistArray = attrWhitelist ? attrWhitelist.split(/\s+/) : [];
            var itemFilterBlacklistArray = attrBlackList ? attrBlackList.split(/\s+/) : [];

            var attrTypeList = $(ui.item).attr('data-item-type');
            var itemTypeListArray = attrTypeList ? attrTypeList.split(/\s+/) : [];

            var canMoveIntoSlot = verifyWithWhiteBlackLists(itemTypeListArray, itemFilterWhitelistArray, itemFilterBlacklistArray);

            if (droppingOnPage){
                droppingOnPage = false;
                return;
            }

            if (!canMoveIntoSlot) {
                $(ui.item).parentToAnimate($(ui.sender), 200);
            } else {                
                var senderItemElement = ui.item;
                var receiverItemElement = $(this).children().not(ui.item);
                var senderDataFullItem = senderItemElement.attr('data-fullitem');
                var receiverDataFullItem = receiverItemElement.attr('data-fullitem');
                var senderData = JSON.parse(senderDataFullItem);
                
                if ( $(this).attr('id') && $(this).attr('id') == 'delete-item' ){
                    if (senderData.amount !== undefined && senderData.amount > 1){        
                        $(ui.item).parentToAnimate($(ui.sender), 200);
                    } else {
                        if (senderData.lock !== undefined && senderData.lock){
                            senderItemElement.parentToAnimate($(ui.sender), 200);
                            $(senderItemElement).addClass('cannot-sell');
                            setTimeout(() => {
                                $(senderItemElement).removeClass('cannot-sell');
                            }, 500);
                            return;
                        } else {
                            senderItemElement.hide();
                        }
                    }

                    var inventoryPosition = senderItemElement.attr('data-inventory-position');
                    var stashPosition = senderItemElement.attr('data-stashposition');
        
                    var isStash;
                    var position;
                    if (inventoryPosition !== undefined && inventoryPosition > -1) {
                        position = inventoryPosition;
                        isStash = false;
                    } else {
                        position = stashPosition;
                        isStash = true;
                    }

                    sellItem(position, isStash, senderData, 1, function(success){
                        if (success){
                            if (senderData.amount === undefined || senderData.amount === 1){
                                senderItemElement.remove();
                            }
                        } else {
                            $(ui.item).parentToAnimate($(ui.sender), 200);
                            senderItemElement.show();
                        }
                    });
                    
                    return;
                }

                var preventSwap = false;
                if ( $(this).attr('id') && $(this).attr('id') == 'remove-gem' ){
                    if (senderData.gem === undefined || senderData.gem === null){
                        $(ui.item).parentToAnimate($(ui.sender), 200);
                        return;
                    } else {
                        preventSwap = true;
                        $(senderItemElement).addClass('removing-gem');
                        setTimeout(() => {
                            $(senderItemElement).removeClass('removing-gem');
                            $(senderItemElement).remove();
                        }, 1000);
                    }             
                }

                // Swap places of items if dragging on top of another
                var hiddenSwap = false;
                if (senderDataFullItem && receiverDataFullItem) {
                    var receiverData = JSON.parse(receiverDataFullItem);
   
                    var senderIsEquipped = senderItemElement.attr('data-equipped');
                    if (!senderIsEquipped){
                        if (($(ui.sender).attr('id') && $(ui.sender).attr('id').startsWith('select'))){
                            senderItemElement.attr('data-equipped', 'true');
                            senderIsEquipped = true;
                        }
                    }
                    var receiverIsEquipped = receiverItemElement.attr('data-equipped');
                    if (!receiverIsEquipped){
                        if ($(this).attr('id') && $(this).attr('id').startsWith('select')){
                            receiverItemElement.attr('data-equipped', 'true');
                            receiverIsEquipped = true;
                        }
                    }

                    if (senderIsEquipped || receiverIsEquipped) {
                        var senderHasGem = senderData.gem !== undefined && senderData.gem !== null;
                        var receiverHasGem = receiverData.gem !== undefined && receiverData.gem !== null;

                        if (senderData.kind == 'gem'){
                            if (receiverHasGem){      
                                $(ui.item).parentToAnimate($(ui.sender), 200);
                                return;
                            } else {
                                receiverData.gem = senderData;
                                receiverItemElement.hide();
                                styleItem(receiverData, senderItemElement[0], false, true);
                                delete receiverData.gem;
                                hiddenSwap = true;
                                $(senderItemElement).addClass('equipped-gem');
                                setTimeout(() => {
                                    $(senderItemElement).removeClass('equipped-gem');
                                }, 2000);
                            }
                        } else {
                            if (senderData.kind !== receiverData.kind){
                                $(ui.item).parentToAnimate($(ui.sender), 200);
                                return;
                            }
                        }

                        if (senderHasGem && !receiverHasGem) {
                            receiverData.gem = senderData.gem;
                            delete senderData.gem;    
                            senderItemElement.attr('data-fullitem', JSON.stringify(senderData));
                            receiverItemElement.attr('data-fullitem', JSON.stringify(receiverData));
                            styleItem(senderData, senderItemElement[0], false, true);
                            styleItem(receiverData, receiverItemElement[0], false, true);
                        }

                        if (!senderHasGem && receiverHasGem) {
                            senderData.gem = receiverData.gem;
                            delete receiverData.gem;    
                            senderItemElement.attr('data-fullitem', JSON.stringify(senderData));
                            receiverItemElement.attr('data-fullitem', JSON.stringify(receiverData));
                            styleItem(senderData, senderItemElement[0], false, true);
                            styleItem(receiverData, receiverItemElement[0], false, true);
                        }
                    }
                }

                preventAnimationWhenMoving(senderItemElement, receiverItemElement);
                clearTimeout(saveInventoryTimer);
                saveInventoryTimer = setTimeout(saveInventory, 200);   
                if (!preventSwap){
                    $(this).children().not(ui.item).parentToAnimate($(ui.sender), 200, hiddenSwap);
                }
            }
        }
    }).each(function () {
        // Setup some nice attributes for everything
        // Makes it easier to update the backend
        $(this).attr('data-slot-position-x', $(this).prevAll('.inventory-cell').length);
        $(this).attr('data-slot-position-y', $(this).closest('.inventory-row').prevAll('.inventory-row').length);
    }).disableSelection();

    $('.page-button').droppable({
        accept: '.inventory-item',
        hoverClass: 'inventory-item-sortable-hover',
        drop: function(event, ui) {
            droppingOnPage = true;
            const item = $(ui.helper);
            const page = $(this).data('page');
            
            if (item.data('inventory-position') !== undefined) {
                const position = item.data('inventory-position');
                stashPutPage(position, page, false);
            } else if (item.data('stashposition') !== undefined) {
                const position = item.data('stashposition');
                stashPutPage(position, page, true);
            }
            item.remove();
        }
    });
}

function verifyWithWhiteBlackLists(itemList, whiteList, blackList) {
    // itemList should contain tags
    // whiteList and blackList can contain tags and tag queries

    // If we have a matching tags to some tag query in the whiteList but not in the blackList, then return true
    // Else return false

    //we delay it since the swapping has an animation

    // If white and black lists are empty, return true
    // Save the calculations, no filtering
    if (whiteList.length == 0 && blackList.length == 0)
        return true;



    // Check if the itemList has an item in the blackList
    var inBlackList = false;
    $.each(blackList, function (index, value) {
        var itemBlack = value;
        var itemBlackAndArray = itemBlack.split(/\+/);

        var andedResult = true;
        for (var i = 0; i < itemBlackAndArray.length; i++) {
            if (blackList.length > 0 && $.inArray(itemBlackAndArray[i], itemList) !== -1) {
                andedResult = andedResult && true;
            }
            else {
                andedResult = andedResult && false;
            }
        }

        if (andedResult)
            inBlackList = true;
    });

    inBlackList = blackList.length > 0 ? inBlackList : false;


    // Check if the itemList has an item in the whiteList
    var inWhiteList = false;
    $.each(whiteList, function (index, value) {
        var itemWhite = value;
        var itemWhiteAndArray = itemWhite.split(/\+/);

        var andedResult = true;
        for (var i = 0; i < itemWhiteAndArray.length; i++) {
            if (whiteList.length > 0 && $.inArray(itemWhiteAndArray[i], itemList) !== -1) {
                andedResult = andedResult && true;
            }
            else {
                andedResult = andedResult && false;
            }
        }

        if (andedResult)
            inWhiteList = true;

    });

    inWhiteList = whiteList.length > 0 ? inWhiteList : false;



    if ((whiteList.length == 0 || inWhiteList) && !inBlackList)
        return true;

    return false;
}
