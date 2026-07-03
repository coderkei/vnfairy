# VNFairy

**A lightweight, beautiful visual novel engine and designer — built entirely in HTML5 & Node.js.**

VNFairy lets you create, design, and play visual novels right in your browser. It comes with a fully-featured visual designer and HTML5 playback engine powered by a small local Node.js server.

**Transparency:** This project was developed with assistance from AI language models. Some parts of the source code were generated or refined using AI, with all generated code reviewed, modified, and integrated by the project author where appropriate. This notice is provided in the interest of transparency.

---

## Screenshots

<p align="center">
  <img src="screenshots/title.png" width="48%" alt="Title Screen" />
  <img src="screenshots/vn1.png" width="48%" alt="Visual Novel Playback" />
</p>
<p align="center">
  <img src="screenshots/designer.png" width="48%" alt="Visual Novel Designer" />
  <img src="screenshots/char.png" width="48%" alt="Character Sprite Editor" />
</p>

> [!NOTE]
> More screenshots of the interface are available in the [screenshots](screenshots) folder.

---

## Features

### Storytelling
- **Scenes & branching** — Build your story out of scenes; add player-choice menus that branch to any other scene and keep track of choices to refer to later on
- **Dialogue** — Write lines of dialogue with a typewriter animation effect and configurable text speed, fonts, formatting and styles
- **Narration & speakers** — Assign any line to a named character or the narrator
- **Kinetic mode** — Hides choice menus so scenes flow directly into the next without branching prompts
- **Title screen** — Animated opening screen with customizable background, music, and title/subtitle colors and various view styles

### Characters & Visuals
- **Character portraits** — Display characters at left, center, or right of the screen with per-line expressions
- **Backgrounds** — Set and switch scene backgrounds, with fade in/out or crossfade transitions
- **Cutscenes** — Show on screen text in the middle for a text based cutscene, with scrolling & fade effects and interactive and non-interactive options
- **Video backgrounds** — Use video files as a scene for video cutscenes

### Audio
- **Background music** — Assign BGM tracks per scene, with automatic track switching
- **Sound effects** — Trigger a sound effect or voice dialogue on any individual dialogue line

### Player Experience
- **Save / Load** — Paginated save slots (12 per page), persisted in the browser local storage
- **Options** — Adjust text speed, skip speed and volume in-game
- **Controls** — Supports both mouse and keyboard controls
- **Achievements & gallery** — Built-in gallery screen for unlockables such as music, background and characters, and an achievements screen for tracking endings.

### Designer & Workflow
- **Visual editor** — A full browser-based designer for building scenes, characters, and assets without any coding or scripting needed
- **Asset manager** — Upload and organize backgrounds, sprites, music, sound effects, and video — all stored per-project on the server
- **Multi-project dashboard** — Create, open, and delete multiple independent projects
- **Test Play** — Preview your novel instantly in a new tab without leaving the editor with an optional debug mode to switch scenes or unlock all unlockables
- **Package Game** — Export a self-contained `.zip` ready to host on any static web server or run locally in a browser without a server
- **Offline fallback** — Drag-and-drop a `project.json` into the player to run without the local server
- **Light/Dark theme** — Toggle editor theme, persisted across sessions

---

## Project Structure

```
VNFairy/
├── index.html          # VNFairy Player (playback engine UI)
├── editor.html         # VNFairy Designer (visual editor UI)
├── server.js           # Local Node.js HTTP server & REST API
├── package.json
├── css/
│   ├── common.css      # Shared design tokens & utilities
│   ├── engine.css      # Styles for the playback engine
│   ├── editor.css      # Styles for the visual designer
│   └── dashboard.css   # Styles for the projects dashboard
├── js/
│   ├── engine.js       # Playback engine logic
│   └── editor.js       # Visual designer logic
└── data/
    └── projects/
        └── <project-id>/
            ├── project.json        # Project metadata & config
            ├── scenes/
            │   └── <scene_id>.json # One JSON file per scene
            └── assets/
                ├── bg/             # Background images
                ├── char/           # Character sprites
                ├── music/          # Background music
                ├── sound/          # Sound effects
                └── video/          # Video files
```

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or newer)

### Running

```bash
# Clone or download this repository, then:
npm install
node server.js
```

By default, the server binds to `127.0.0.1` (localhost) on port `3000`, making it accessible locally at `http://localhost:3000`. To access it over your local network, you can explicitly bind it to a custom IP address or `0.0.0.0` (all local interfaces).

#### Custom Ports and Host IPs
You can explicitly define a custom port and binding IP using command-line parameters:

  ```bash
  node server.js --port=8080 --host=192.168.1.100
  ```

| URL | Description |
|-----|-------------|
| `http://localhost:3000/` | VNFairy Player — play your visual novels |
| `http://localhost:3000/editor.html` | VNFairy Designer — create and edit projects |

A **demo project** is created automatically on first run at `data/projects/demo/`.

---

## Packaging & Distribution

Click **"Package Game"** in the Designer toolbar to export a self-contained `.zip` of your visual novel. The archive includes:

- `index.html` — the standalone player
- `css/` & `js/` — engine assets
- `data/` — your project data, scenes, and all uploaded assets
- Per-scene `.js` wrapper files for CORS-free offline playback

The resulting `<project-id>_game.zip` can be hosted on any static web server or extracted and opened locally.

---

## REST API Reference

The local server exposes a simple JSON API used by the designer:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/project?id=<id>` | Load a project (scenes merged) |
| `POST` | `/api/project?id=<id>` | Save a project |
| `POST` | `/api/project/create` | Create a new project |
| `POST` | `/api/project/delete?id=<id>` | Delete a project |
| `GET` | `/api/assets?project=<id>` | List assets for a project |
| `POST` | `/api/upload` | Upload an asset (base64 JSON body) |
| `POST` | `/api/asset/delete` | Delete an asset file |
| `POST` | `/api/package?id=<id>` | Package a project into a `.zip` |

All other paths are served as static files from the project root.

---

## Scene Format

Each scene is stored as a `.json` file under `data/projects/<id>/scenes/`:

```json
{
  "id": "scene_1",
  "name": "Introduction",
  "background": "data/projects/demo/assets/bg/forest.png",
  "music": "data/projects/demo/assets/music/theme.mp3",
  "dialogue": [
    {
      "speaker": "Narrator",
      "text": "It was a quiet morning...",
      "layout": { "left": null, "center": null, "right": null },
      "sound": ""
    },
    {
      "speaker": "Aria",
      "text": "Hello there!",
      "layout": {
        "left": { "character": "aria", "expression": "happy" },
        "center": null,
        "right": null
      }
    }
  ],
  "choices": [
    { "text": "Say hello back", "targetSceneId": "scene_2" },
    { "text": "Stay silent",    "targetSceneId": "scene_3" }
  ]
}
```

---

## License

VNFairy is licensed under the GNU General Public License version 3, or (at your option) any later version.

A special exception permits visual novels exported using the **Package Game** feature (either via the Designer or via the API) to be distributed under any license, including proprietary licenses, when they include an unmodified copy of the VNFairy Player. This exception does not affect the licensing of VNFairy itself or any modifications to the VNFairy Player, which remain licensed under the GNU GPL.

See `LICENSE.txt` for the full license and exception.

---
