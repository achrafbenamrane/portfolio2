# The 3D store pipeline

Everything the sports store draws is built from these scripts, so it can be rebuilt
after a change. Run them from the repo root, in this order. Each step only needs
re-running if what it reads has changed.

`B` is the Blender 5.2 executable.

| Step | Command | What it does | Time |
| --- | --- | --- | --- |
| 1 | `B --background --factory-startup --python scripts/blender/build_jersey.py -- assets-source/store/jersey 0.0125 170` | Cuts, sews and drapes the shirt in the cloth solver | 2 min |
| 2 | `B --background --factory-startup --python scripts/blender/finish_jersey.py -- assets-source/store/jersey public/store` | Collar, hems, hanging shape, skeleton, AO; writes `jersey.glb` | 30 s |
| 3 | `python scripts/store_kits.py` | Paints the eight kits and the shared normal maps | 1 min |
| 4 | `python scripts/store_ball.py` | Paints the football | 5 s |
| 5 | `B --background --factory-startup --python scripts/blender/build_store.py -- assets-source/store/build assets-source/store/jersey public/store src/content/store-layout.json` | Builds the room and writes the layout the page reads | 15 s |
| 6 | `B --background --factory-startup assets-source/store/build/store.blend --python scripts/blender/bake_store.py -- assets-source/store/build public/store 256` | Bakes the light, renders the poster and panorama, writes `store.glb` | 20 min |
| 7 | `python scripts/store_bake_post.py` | Tone-maps the bakes into web textures | 30 s |

`render_view.py` and `preview_kit.py` are for looking at the work in progress.

Exposure lives in step 7, so tuning it does not need a new bake. Moving anything in
the room means steps 5 to 7. Changing a kit's colours means steps 3, and 5 to 7 if
you want the rail in the poster and the bake to match.

## The ONEFRAME museum

The museum is built the same way, from `public/projects/oneframe/products.webp`. The hall
is black and baked; the frames' prints and cars are drawn by the page, so they can move.

| Step | Command | What it does | Time |
| --- | --- | --- | --- |
| 1 | `python scripts/museum_frames.py` | Cuts each frame into a print, a subject and a relief. Needs `src/content/museum-layout.json` from step 2 for the box's shape | 30 s |
| 2 | `B --background --factory-startup --python scripts/blender/build_museum.py -- assets-source/museum/build public/museum src/content/museum-layout.json` | Builds the hall and frames | 15 s |
| 3 | `B --background --factory-startup assets-source/museum/build/museum.blend --python scripts/blender/bake_museum.py -- assets-source/museum/build public/museum 256` | Bakes the light, renders the poster, writes `museum.glb` and `frame.glb` | 13 min |
| 4 | `python scripts/museum_bake_post.py` | Tone-maps the bakes. Exposure lives here | 15 s |

`assets-source/museum/build/logo-wall.png` is the boxed wordmark, cut from
`public/projects/oneframe/logo-bw.webp`.

The Camaro and the Lotus are found partly by hue, because the cut-out model can't see a
yellow car on a yellow print. If a sharper photo replaces `products.webp`, the pixel boxes
in `FRAMES` in `museum_frames.py` have to be measured again.

## The pizza kitchen

The pizza isn't modelled or photographed: `pizza_maps.py` simulates it as a height field,
and Blender only lights it. The page draws everything but the reflections from the bakes.
The light and the wood, brick and stone come from Poly Haven (CC0), in
`assets-source/pizza/polyhaven/`.

| Step | Command | What it does | Time |
| --- | --- | --- | --- |
| 1 | `python scripts/pizza_maps.py 2048 7` | Simulates the dough, sauce, cheese and bake, one folder per stage | 1 min |
| 2 | `python scripts/pizza_stamps.py` | Lays out six toppings, six pieces each, raw and baked, in matching sheets | 20 s |
| 3 | `B --background --factory-startup --python scripts/blender/pizza_look.py -- . assets-source/pizza/bake/x.png 2048 2048 160 1600 200 bake <stage>` for `baked`, `dough`, `sauced` and `cheesed` | Bakes each stage's light from above, and the table with the baked one | 3 min each |
| 4 | `B --background --factory-startup --python scripts/blender/pizza_look.py -- . assets-source/pizza/bake/x.png 1920 1920 128 1920 200 stamps <sheet>` for `stamps-raw` and `stamps-baked` | Bakes the topping sheets under a soft overhead light | 1 min each |
| 5 | `B --background --factory-startup --python scripts/blender/build_oven.py -- . bake` | Builds the oven, bakes it, writes `oven.glb` | 8 min |
| 6 | `python scripts/pizza_web.py` | Packs everything into `public/pizza/` | 30 s |

For a full-quality still, run `python scripts/pizza_maps.py 4096 7 hero`, then step 3's
command without `bake`. The poster comes from `assets-source/pizza/renders/hero-2.png`.
To watch the scene in Blender, save it with `show hero` and open it with `pizza_window.py`.

### The restaurant and the chef

The page is the whole of Wolfexo Fast Food: the room is baked like the store, the menu is
a book the page draws, and the pizza above is what's on the bench. The chef isn't drawn by
the page at all. He's rendered in Cycles, in the room's real light, and played as video
behind a transparent scene with the same camera, so the only live thing in his shots is
the pizza the visitor made.

He comes from MakeHuman's CC0 data, read straight out of the zips in
`assets-source/pizza/human/dl/`: `mpfb.zip` and `system.zip`. No add-on code is run, because
MPFB's code is GPL and only its assets are CC0. The face is `public/portrait.webp`: the face
landmarker runs on that and on `build_chef.py`'s `head` render, and the two sets of 478
points are saved as `face.json` and `mh-face.json` in `assets-source/pizza/chef/`.

| Step | Command | What it does | Time |
| --- | --- | --- | --- |
| 7 | `python scripts/pizza_chef_human.py` | Builds his body, clothes, eyes, teeth and hair from the zips | 30 s |
| 8 | `python scripts/pizza_chef_body.py` | Cuts the apron, neckerchief and toque to that body | 20 s |
| 9 | `python scripts/pizza_chef_face.py` | Pulls the head into the portrait's shape and lays the photo over the skin | 30 s |
| 10 | `B --background --factory-startup --python scripts/blender/build_chef.py -- . blend assets-source/pizza/chef/chef.blend` | Rigs him, poses the Serve and Idle clips, saves him | 10 s |
| 11 | `B --background --factory-startup --python scripts/blender/build_pizzeria.py -- . film serve track`, then `film meet track` | Writes the film cameras and the peel's path to `src/content/pizza-film.json` | 15 s each |
| 12 | `B --background --factory-startup --python scripts/blender/build_pizzeria.py -- . film serve assets-source/pizza/film/serve 1-136 64`, then `film meet assets-source/pizza/film/meet 1-91 64` | Renders both shots a frame at a time. Run it again and it carries on from the last frame | 50 min, 30 min |
| 13 | `B --background --factory-startup --python scripts/blender/build_pizzeria.py -- . film meet card 96` | Cuts him out as the corner camera sees him, for the wide view of the room | 2 min |
| 13b | `B --background --factory-startup --python scripts/blender/build_pizzeria.py -- . film serve cover 96` | Renders the still that's the build's cover on `/3d` | 3 min |
| 14 | `B --background --factory-startup --python scripts/blender/build_pizzeria.py -- . bake` | Bakes the room, writes `pizzeria.glb` and `pizzeria-layout.json` | 13 min |
| 15 | `python scripts/pizza_web.py`, then `python scripts/pizza_film.py` | Packs the room, then encodes the clips and stills | 1 min |

`build_chef.py look` and `pose` render him alone in a studio, which is quicker for checking
his clothes and his moves. To see one moment in the room, render a single frame with step
12's command, as in `… film serve assets-source/pizza/film-test 66 64`.

To sell it to a real restaurant, change `src/content/pizza.ts`: the name, prices and
WhatsApp number all live there, and setting `demo` to false takes the demo wording away.
A new topping is a new function in `pizza_toppings.py`, a line in `TOPPINGS` in
`pizza_stamps.py`, and steps 2, 4 and 6.

Three things are easy to break:

- **The pizza shader is at the 16-texture limit** a graphics card guarantees. Adding a map
  means packing another one tighter, or it fails on every device at once.
- **Only the flat bakes carry light.** Reflections are live, so `gloss` and `rough` still
  matter even though the material itself is black.
- **Don't run a side effect inside a React state updater here.** Strict Mode runs it twice,
  and that's two handfuls of toppings.
- **The film's camera is the page's camera.** Move the camera in `FILMS` and steps 11 to 15
  all have to run, or the pizza slides on the peel. The clip itself never goes through the
  page's tone mapping: it's graded in Blender, and the lens lays it in after its own grade.
- **Check the log when you change a pose.** `build_chef.py` prints `short of the handle` when
  an arm can't reach. A hand a few centimetres out reads as floating, so solve it in the pose.

## Tether (/3d/2090)

A space game played through the webcam. There are no animation clips anywhere in it: the robot
is rigid parts on nodes, and every pose is worked out each frame from where its feet are planted
and where its hands are going, which is what lets a hand drive it directly. The Moon and the sun
on it are simulated. The rocks and lunar ground are Poly Haven's (CC0), and the Earth, Moon and
star maps are Solar System Scope's (CC BY 4.0, from NASA data), which the title screen credits.

Downloads go in `assets-source/tether/dl/`: `ground/moon_dusted_05/`, `rocks/moon_rock_01..07/`
and `space/8k_*.jpg`.

| Step | Command | What it does | Time |
| --- | --- | --- | --- |
| 1 | `python scripts/tether_decals.py` | Draws the sheet of stencils and unit numbers | 2 s |
| 2 | `B --background --python scripts/blender/build_tether_robot.py -- . bake 4096 16` | Builds the robot, bakes paint and an enemy repaint, writes `robot.glb` | 30 min |
| 3 | `B --background --python scripts/blender/build_tether_ship.py -- . bake heron 2048 10`, then `raider 1024 10`, then `base 2048 10` | The same, for the two ships and the base | 5 min each |
| 4 | `B --background --python scripts/blender/build_tether_rocks.py -- . 900` | Cuts the scanned rocks down to game meshes | 30 s |
| 5 | `python scripts/tether_terrain.py 2048` | Simulates the craters and traces the sun over them | 1 min |
| 6 | `python -I scripts/tether_pack.py robot heron raider base ground space` | Packs it all into `public/2090/` | 1 min |
| 7 | `node scripts/tether-voice.mjs` | Speaks `src/content/tether.json` in the assistant's voice | 20 s |

`build_tether_robot.py -- . preview <out.png> [degrees] [height] [lens] [target z]` and the same on
the ship script render a look without baking. All the machines share `tether_kit.py`, which builds
a limb as a dark core with separate armour plates over it: the gaps are real, and they're most of
what stops it looking like a toy. `tether_surface.py` is the paint: wear on edges, grime in
corners, and dust climbing from the feet, all baked down to game textures.

To test the controls without a person, `tether_hand_film.py` and `tether_body_film.py` film a human
hand and body doing every gesture. Join the frames into an MJPEG and hand it to Chrome with
`--use-file-for-fake-video-capture`, and the real tracking models have to find them:

    ffmpeg -framerate 15 -i film/h%04d.jpg -vf "fps=30,format=yuvj420p" -c:v mjpeg -q:v 3 -f mjpeg hand.mjpeg

Chrome plays such a file at 30 frames a second whatever it was made at, so leave out `fps=30` and
every gesture runs at double speed, and any threshold tuned against it is wrong.

Four things are easy to break:

- **A NaN in any shader turns the whole picture black**, because the bloom pass spreads it. `pow` of
  a value that dips below zero is the usual way. Clamp first.
- **The gesture thresholds are in palm lengths, not screen widths.** That's what makes it play the
  same from across a room. Keep new ones that way.
- **Sound needs a real click.** A scripted `.click()` isn't a user gesture, so a test has to use a
  real mouse event to hear anything.
- **The pose model can't tell which arm punched.** Throw one and the depth of both wrists jumps. So
  body punches are read as a surge from a guard and the arms take turns; don't try to split them.

The earlier liquid-metal version of this page was rejected, and is kept in
`assets-source/y2090/liquid-metal/`.

## Alger la Nuit (/3d/alger-la-nuit)

An open map of central Algiers at night. Every street on the map can be ridden: about 580 km, joined
into one network with the main road, a wider 15 km line from Maqam Echahid through the old centre and
along the bay to the Great Mosque. A map in the corner leads the rider to ten famous places. The bike is the owner's choice of a real supercharged hyperbike, built from photographs, with three makers' names set as lettering (`moto_marks.py`). They sit in objects named `Marks*`, and `SHOW_MARKS` in `game.ts` turns them all off, leaving clean panels. The city is real
map data: OpenStreetMap footprints and roads (ODbL) and Mapzen terrain tiles, credited on the title
screen. The asphalt and the night panorama are Poly Haven's (CC0). The lettering is Archivo (OFL).

Everything downloaded goes in `assets-source/moto/dl/`, which is gitignored along with `build/`.

| Step | Command | What it does | Time |
| --- | --- | --- | --- |
| 1 | `python scripts/moto_tyres.py` | Draws tread and sidewall lettering | 10 s |
| 2 | `B --background --python scripts/blender/build_moto.py -- . export public/moto/fang.glb` | Builds the bike, packs it, and writes where its grips, pegs, seat and exhaust are to `src/content/moto-bike.json`. `preview <out.png> [degrees] [height] [lens] [target y] [target z] [samples] [width]` renders it in a studio | 20 s |
| 3 | `B --background --python scripts/blender/build_moto_rider.py -- . map`, then `python scripts/moto_suit.py`, then the same Blender line without `map` | Maps the suit, paints it, and poses the rider in five poses on the grips and pegs from `moto-bike.json`, so run this after any change to them | 1 min |
| 4 | `python -I scripts/moto_route.py` | Walks the road network leg by leg, with the junctions redrawn by hand | 3 s |
| 5 | `python -I scripts/moto_city.py` | Joins every street into one network, lays the one surface everything stands on, builds the street walls of the main road, and raises every other footprint. Needs `dl/world/` as well as `dl/osm/`. Writes `network.bin`, `buildings.bin`, `facade.bin`, `ground.png` | 1 min |
| 6 | `B --background --python scripts/blender/build_moto_city.py -- .`, then `python -I scripts/moto_map.py` | Compresses the city, and draws the land under the rider's map | 40 s |
| 7 | `B --background --python scripts/blender/build_moto_atlas.py -- .`, then `python scripts/moto_facade_pack.py` | Models every kind of bay in full, path-traces each under the night's up-lighting, packs them into one atlas, and draws the iron rails | 3 min |
| 8 | `B --background --python scripts/blender/build_moto_facade.py -- .` | The small modules that give the atlas real depth: reveals, balconies, arcade vaults | 3 s |
| 9 | `B --background --python scripts/blender/build_moto_cars.py -- .` | The traffic: a hatchback, a saloon that doubles as the taxi, a crossover and a bus, all original designs | 12 s |
| 10 | `python scripts/moto_street_signs.py`, then `B --background --python scripts/blender/build_moto_street.py -- .` | Road signs, gantries, leaf sheet, then the street furniture kit | 1 min |
| 11 | `B --background --python scripts/blender/build_moto_marks.py -- .` | Models the monuments at their real positions. Needs `build/mark-bases.json` and `build/mosque.json` | 5 s |
| 12 | `python scripts/moto_signs.py` | Draws the Arabic and French shop signs. Needs `arabic_reshaper` and `python-bidi` | 2 s |
| 13 | `B --background --python scripts/blender/build_moto_people.py -- .` | The people on the pavements: five figures from MakeHuman's CC0 data (see below), their walk and idle baked frame by frame. Writes `public/moto/city/people.bin` and `people.webp`. `look <out dir> [0,2,4]` renders them on the CPU instead, to judge the clothes and the walk | 4 min |

The cover is three layers: a shot of the game for the street, a Cycles render of the bike and rider
with their shadow on nothing, and the rider's real head from `assets-source/portrait-original.jpg`,
relit. Stand the rider with `build_moto_rider.py -- . cover`, render with `build_moto.py -- . cover
<fg.png> [samples] [width]`, shoot the street from the game at the same lens (50 mm is a vertical
field of 22.9 degrees, with the camera 1.3 m up and pitched down 3.4 degrees), then run
`python scripts/moto_cover.py <street.png> <fg.png> <out.webp>`. A replaced image needs a new file
name, because next/image keeps the old one in its cache.

Bodywork is a `Skin` in `moto_kit.py`: cross-sections down the bike, read as a rational spline, so a
heavy control point is a crease that can fade out along its length. Panels are cut from it in side
view, and each gets thickness and a rolled edge. The normals come from the surface, not the mesh.

These are easy to break:

- **`patch` is a reserved word in GLSL.** So are a few other plain English ones. A shader that fails
  to compile just draws nothing, so check the console: the ground vanished this way once.
- **glTF stores v as one minus v.** Every shader reading a second UV for data has to undo it, or
  walls turn into roofs. The bike's titanium ramp in `finishes.ts` undoes it the same way.
- **Never feed a varying straight into a hash.** The tiny jitter a varying picks up gets amplified
  into noise. Round it first, as the building shader does with its seed.
- **`palmOf` is already mirrored,** so left and right are the rider's own. Don't flip them again.
- **Chrome's fake camera plays at 30 fps.** Encode test films with `fps=30`. See the Tether notes.
- **A building's solid mass must stand behind its front.** The modules' glass is set back in the
  wall, so a mass on the front line hides every window. `SETBACK` and `ARCADE_DEEP` keep it clear.
- **A median can't begin as a wall.** A rider on the left of the street would be pinned to it. Its
  nose eases the bike across in `Fang.follow`, at no cost in speed.
- **Don't pipe `moto_city.py` into `head`.** The closed pipe kills it before it writes the ride line.
- **The sky photograph is green.** Anything glossy mirrors it as olive, so `game.ts` takes most of the colour out of it on load, and `street.ts` takes the rest out for the road.
- **Roads are the only way through.** `World.keepOnRoad` is the kerb, on every street. Only the esplanade is free. A new surface the rider should reach needs an edge in the network.
- **`Chrome` and `Silver` read vertex colours,** so `finishes.ts` and `fang.glb` have to change together.
- **There is one surface.** The bike, the roads, the cars and the ground all read `ground.png`, so a
  road and the ground beside it can't disagree. Change the heights only in `height_map`.
- **The map has walls across its streets.** A footprint on OpenStreetMap often overlaps a road. After a
  rebuild, walk every street checking for walls: at most a couple should be blocked, and never the main road.
- **A wall of the kit stands proud of its building.** The street walls keep their masses back by
  `SETBACK`, and `Facades.dress` moves its modules out by `PROUD`. If one changes, so must the other.

## Testing the mirror without a person

A still photo can't show whether the shirt follows a turn. `mirror_turntable.py`
renders a clothed human turning at a known 45 degrees a second. Join the frames into a
clip with ffmpeg, then run Chrome with it as a fake camera:

    ffmpeg -framerate 30 -i full/f_%04d.jpg -vf format=yuvj420p -c:v mjpeg -q:v 3 -f mjpeg turn.mjpeg
    chrome --use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=turn.mjpeg

In development the page exposes `window.__mirrorFit` and `window.__mirrorSensor`, so a
script can read the turn, the row widths and what each stage costs on every frame.
Taking a screenshot stalls the page long enough to lose tracking, so log the numbers
and don't judge timing from a run that is also taking pictures.

## Rules that are easy to break

- **Blender paths must be absolute.** A relative `render.filepath` lands at the root
  of the drive. The scripts all resolve theirs first.
- **The kits show no club badges or sponsors.** They are other people's trademarks and
  this is a public site. To use a licensed badge, put a PNG at
  `assets-source/store/crests/<slug>.png` and re-run step 3.
- **The page reads `src/content/store-layout.json`**, written in step 5. Never edit it
  by hand: change `build_store.py`.
- **Blender is Z-up and the page is Y-up.** Go through `toWeb()` in `src/content/store.ts`.
- **The shirt's bones and rows are measured against `jersey.glb`.** If the shirt's cut
  changes, check `REST_JOINT_*` and `REST_SEAM_Y` in `src/lib/vision/garment-fit.ts`.
- **The cloth must start flat.** The solver takes the starting pose as the cloth's rest
  shape, so curved panels keep a belly. The dress form's arms are thinner than a real
  arm for the same reason: a form that fills the sleeve leaves the seam nothing to close.
