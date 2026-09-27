import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export async function run() {
 await Scripting.sleep(2000); Main.overview.hide();
 const root=GLib.getenv('LUNA_TEST_ROOT');
 const output=GLib.build_filenamev([GLib.get_tmp_dir(),`luna-focus-${GLib.uuid_string_random()}.txt`]);
 const launcher=new Gio.SubprocessLauncher({flags:Gio.SubprocessFlags.NONE});
 launcher.set_environ(global.create_app_launch_context(0,-1).get_environment());launcher.setenv('GDK_BACKEND','wayland',true);
 const child=launcher.spawnv(['python3',`${root}/tests/overview-input.py`,output]);
 const keyboard=Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
 const type=async key=>{keyboard.notify_keyval(0,key,Clutter.KeyState.PRESSED);keyboard.notify_keyval(0,key,Clutter.KeyState.RELEASED);await Scripting.sleep(120);};
 try {
  let window;
  for(let i=0;i<40;i++){window=global.get_window_actors().map(a=>a.meta_window).find(w=>w.get_title()==='Overview input regression');if(window)break;await Scripting.sleep(100);}
  if(!window)throw new Error('Input window missing');
  Main.activateWindow(window);await Scripting.sleep(300);await type(Clutter.KEY_a);
  const file=Gio.File.new_for_path(output);
  const read=()=>new TextDecoder().decode(file.load_contents(null)[1]);
  if(read()!=='a')throw new Error('Input must be focused before opening overview');
  Main.overview.show();await Scripting.sleep(450);
  await type(Clutter.KEY_z);
  if(global.display.get_focus_window())throw new Error('Client window retains focus in overview');
  if(read()!=='a')throw new Error('Overview typing reached old input');
  if(!Main.overview._overview.searchEntry.get_text().includes('z'))throw new Error('Overview search did not receive typing');
  Main.overview.hide();await Scripting.sleep(400);
  Main.activateWindow(window);await Scripting.sleep(200);await type(Clutter.KEY_b);
  if(read()!=='ab')throw new Error('Window input cannot regain focus');
  file.delete(null);print('OVERVIEW_INPUT_PASS');
 } finally {child.force_exit();}
}
