import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export async function run() {
 await Scripting.sleep(1800); Main.overview.hide();
 const r=Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
 const e=r._appletEditor;
 const pointer=Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
 for (const edge of ['bottom','left','right','top']) {
  r._settings.reset('applet-order');
  r._settings.set_string('taskbar-position',edge);
  r._settings.set_boolean('show-search-button',true);
  r._settings.set_boolean('search-panel-enabled',true);
  await Scripting.sleep(400);e.start();await Scripting.sleep(200);
  const source=e._entries[0]; const target=e._entries.find(entry=>entry.id==='appbar');
  const [sx,sy]=source.button.get_transformed_position();
  const [tx,ty]=target.button.get_transformed_position();
  const x=sx+source.button.width/2,y=sy+source.button.height/2;
  const dx=tx+target.button.width*.8,dy=ty+target.button.height*.8;
  pointer.notify_absolute_motion(0,x,y);await Scripting.sleep(80);
  pointer.notify_button(0,1,Clutter.ButtonState.PRESSED);await Scripting.sleep(80);
  for(let i=1;i<=15;i++) { pointer.notify_absolute_motion(0,x+(dx-x)*i/15,y+(dy-y)*i/15);await Scripting.sleep(25); }
  if (!e._source) throw new Error(`${edge}: pointer did not start a drag`);
  pointer.notify_button(0,1,Clutter.ButtonState.RELEASED);await Scripting.sleep(400);
  if(e._entries[0]===source) throw new Error(`${edge}: pointer drag did not reorder ${source.id}`);
  const movedOrder=e._entries.map(entry=>entry.id);
  e.stop();await Scripting.sleep(100);
  const stored=r._settings.get_strv('applet-order');
  if (stored.indexOf(source.id) !== movedOrder.indexOf(source.id)) throw new Error(`${edge}: drop not saved`);
 }
 print('EDIT_POINTER_DRAG_PASS');
}
