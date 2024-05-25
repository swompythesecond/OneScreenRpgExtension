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
    parentToAnimate: function (newParent, duration) {
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
                $element.show();
                temp.remove();
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




// Sorting, dragging, dropping, etc

refreshSortableInventoryList();
function refreshSortableInventoryList() {
    $('.inventory-cell').sortable({
        connectWith: ['.inventory-cell', '.page-button'],
        placeholder: 'inventory-item-sortable-placeholder',
        sort: function(event, ui) {
            $(this).attr('moving', 'true');
            $('.ui-tooltip').remove();
        },
        stop: function(event, ui) {
            $(this).removeAttr('moving');
            $(ui.sender).removeAttr('moving');
        },
        receive: function (event, ui) {            
            var attrWhitelist = $(this).closest('.inventory-table').attr('data-item-filter-whitelist');
            var attrBlackList = $(this).closest('.inventory-table').attr('data-item-filter-blacklist');
            var itemFilterWhitelistArray = attrWhitelist ? attrWhitelist.split(/\s+/) : [];
            var itemFilterBlacklistArray = attrBlackList ? attrBlackList.split(/\s+/) : [];

            var attrTypeList = $(ui.item).attr('data-item-type');
            var itemTypeListArray = attrTypeList ? attrTypeList.split(/\s+/) : [];

            var canMoveIntoSlot = verifyWithWhiteBlackLists(itemTypeListArray, itemFilterWhitelistArray, itemFilterBlacklistArray);

            if (!canMoveIntoSlot) {
                $(ui.item).parentToAnimate($(ui.sender), 200);
            } else {
                // Swap places of items if dragging on top of another
                $(this).children().not(ui.item).parentToAnimate($(ui.sender), 200);
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
            var attrWhitelist = $(this).closest('.inventory-table').attr('data-item-filter-whitelist');
            var attrBlackList = $(this).closest('.inventory-table').attr('data-item-filter-blacklist');
            var itemFilterWhitelistArray = attrWhitelist ? attrWhitelist.split(/\s+/) : [];
            var itemFilterBlacklistArray = attrBlackList ? attrBlackList.split(/\s+/) : [];

            var attrTypeList = $(ui.helper).attr('data-item-type');
            var itemTypeListArray = attrTypeList ? attrTypeList.split(/\s+/) : [];

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
    

    clearTimeout(saveInventoryTimer);
    saveInventoryTimer = setTimeout(saveInventory, 200)

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
