import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

function assert(value, message) {
    if (!value)
        throw new Error(message);
}

export async function run() {
    await Scripting.sleep(1600);
    Main.overview.hide();
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild')?.stateObj?.runtime;
    assert(runtime, 'Luna Taskbar is running');
    const drag = runtime._taskDrag;
    const pinned = [...runtime._buttons.values()].filter(record => drag._pinned(record));
    assert(pinned.length >= 2, 'At least two pinned applications are available');
    const sourceRecord = pinned[0];
    const source = sourceRecord.button._delegate;
    const originalIndex = runtime._favorites.getFavorites()
        .findIndex(app => app.get_id() === source.app.get_id());

    drag._begin(source);
    drag.handleDragOver(source, null, runtime._apps.width - 1, runtime._apps.height / 2);
    await Scripting.sleep(100);
    const [targetX, targetY] = drag._placeholder.get_transformed_position();
    const [targetWidth, targetHeight] = drag._placeholder.get_transformed_size();
    const dropOffset = 11;
    const actor = new St.Widget({width: 24, height: 24});
    Main.uiGroup.add_child(actor);
    actor.set_position(targetX + targetWidth / 2 - 12 + dropOffset,
        targetY + targetHeight / 2 - 12);
    await Scripting.sleep(50);

    let initialTranslation = null;
    const translationId = sourceRecord.button.connect('notify::translation-x', button => {
        if (initialTranslation === null && Math.abs(button.translation_x) > 0.5)
            initialTranslation = button.translation_x;
    });
    assert(drag.acceptDrop(source, actor, runtime._apps.width - 1,
        runtime._apps.height / 2), 'Taskbar accepts its own app drop');
    actor.destroy();
    await Scripting.sleep(260);
    const [finalX, finalY] = sourceRecord.button.get_transformed_position();
    const [finalWidth, finalHeight] = sourceRecord.button.get_transformed_size();
    assert(initialTranslation !== null,
        `Dropped button starts a placement animation: pending=${sourceRecord.button._lunaDropPending}, ` +
        `opacity=${sourceRecord.button.opacity}, final=${finalX + finalWidth / 2},${finalY + finalHeight / 2}, ` +
        `target=${targetX + targetWidth / 2},${targetY + targetHeight / 2}`);
    assert(Math.abs(initialTranslation - dropOffset) <= 3,
        `Drop animation begins at pointer clone (${initialTranslation}/${dropOffset})`);
    assert(sourceRecord.button.opacity === 255, 'Dropped button appears only at its final allocation');
    await Scripting.sleep(220);
    sourceRecord.button.disconnect(translationId);
    assert(Math.abs(sourceRecord.button.translation_x) < 0.5,
        'Drop placement animation reaches the final taskbar slot');

    runtime._favorites.moveFavoriteToPos(source.app.get_id(), originalIndex);
    await Scripting.sleep(100);
    print('LUNA_TASKBAR_DROP_ORIGIN_PASS');
}
