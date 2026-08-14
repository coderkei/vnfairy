# VNFairy

**A lightweight, beautiful visual novel engine and designer — built entirely in HTML5 & Node.js.**

**Current release: 2.0.0**

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
- **Scenes & branching** — Build your story out of scenes, route linearly or through player choices, add conditional jumps, and attach tidy multi-requirement and multi-action rules to choices
- **Dialogue** — Write in visual Cards or a compact Script view with multi-line selection, bulk speaker assignment, block duplication, reordering, bookmarks, and story-wide search and replace
- **Narration & speakers** — Choose any character or Narrator from a searchable picker for individual dialogue lines or selected script blocks
- **Kinetic mode** — Hides choice menus so scenes flow directly into the next without branching prompts
- **Title screen** — Animated opening screen with customizable background, music, and title/subtitle colors and various view styles

### Characters & Visuals
- **Character portraits** — Display characters at left, center, or right of the screen with per-line expressions
- **Backgrounds** — Use uploaded artwork, the novel theme's default background, or a solid white scene background, with fade in/out or crossfade transitions
- **Cutscenes** — Show on screen text in the middle for a text based cutscene, with scrolling & fade effects and interactive and non-interactive options
- **Video backgrounds** — Use video files as a scene for video cutscenes

### Audio
- **Background music** — Assign BGM tracks per scene, with automatic track switching
- **Sound effects** — Trigger a sound effect or voice dialogue on any individual dialogue line

### Player Experience
- **Save / Load** — Paginated save slots (12 per page), persisted in browser storage by immutable project ID so title changes do not hide progress
- **Options** — Adjust text speed, skip speed and volume in-game
- **Controls** — Supports both mouse and keyboard controls
- **Achievements & gallery** — Built-in gallery screen for unlockables such as music, background and characters, and an achievements screen for tracking endings.

### Designer & Workflow
- **Visual editor** — A full browser-based designer for building scenes, characters, and assets without any coding or scripting needed
- **At-a-glance sidebars** — Browse collapsible scene groups and asset categories without leaving the editor; use the compact **Manage** buttons when you need the full workspaces
- **Asset Management workspace** — Use a dedicated tabbed modal to upload and organise backgrounds, characters, music, voice and sound, and video. Search, filter, favourite, tag, sort, create virtual folders, find unused files and usage locations, preview media, replace references everywhere, or apply uploads, folders, tags, and deletion in bulk.
- **Scene Management workspace** — Review scenes and groups in a full-size tabbed modal, search and filter the story, create scenes or groups, bulk-update group or status, bulk-delete, and open, configure, or duplicate individual scenes.
- **Tabbed scene settings** — Configure scene identity and notes under **Basics**, backgrounds, audio, fonts, and cutscene media under **Media**, and transitions, endings, bookmarks, and player behaviour under **Behaviour**. The live stage preview follows the novel's light or dark theme for dialogue and text colours.
- **Authoring defaults** — Set a default expression for each character and save reusable pose sets for dialogue layouts.
- **Multi-project dashboard** — Create, import, duplicate, rename, archive, export, and delete independent projects
- **Trustworthy authoring** — Project-wide undo/redo, explicit disk/local/failure status, atomic validated saves, and the last 10 successful versions for recovery
- **Source project archives** — Export and import editable `.vnfairy` archives containing project configuration, scenes, and assets
- **Test Play** — Preview your novel instantly in a new tab without leaving the editor with an optional debug mode to switch scenes or unlock all unlockables
- **Export game** — Export a self-contained `.zip` ready to host on any static web server or run locally in a browser without a server
- **Offline fallback** — Drag-and-drop a `project.json` into the player to run without the local server
- **Light/Dark theme** — Toggle editor theme, persisted across sessions

---

## Project Structure

```
VNFairy/
├── index.html          # VNFairy Player (playback engine UI)
├── editor.html         # VNFairy Designer (visual editor UI)
├── server.js           # Local Node.js HTTP server & REST API
├── project-store.js    # Transactional project persistence, migrations & recovery
├── asset-service.js    # Project-scoped asset registry operations
├── package-service.js   # Playable ZIP packaging service
├── shared/              # Browser/Node schema, migrations, model, validation & saves
├── tests/               # Migration, serializer, validator and store tests
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

### Persisted Artifact Versions

Projects and player saves carry independent metadata for their serialized format and runtime provenance:

```json
{
  "schemaVersion": 1,
  "engineVersion": "2.0.0",
  "createdWithVersion": "2.0.0"
}
```

`schemaVersion` selects an explicit migration chain. `engineVersion` identifies the runtime that last wrote the artifact, while `createdWithVersion` records the original authoring/runtime version. Legacy artifacts are migrated in memory and written through the normal validated save path. Player saves additionally include `projectId`, `projectSchemaVersion`, `savedAt`, and a nested `state` object.

Run the dependency-free regression tests with:

```bash
npm test
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

Click **Export game** in the Designer toolbar to export a self-contained `.zip` of your visual novel. The archive includes:

- `index.html` — the standalone player
- `css/` & `js/` — engine assets
- `data/` — your project data, scenes, and all uploaded assets
- Per-scene `.js` wrapper files for CORS-free offline playback

The resulting `<project-id>_game.zip` can be hosted on any static web server or extracted and opened locally.

Asset-library metadata is editor-only project data. The packaged player continues to load the normal `data/` files and per-scene wrappers, so opening the packaged `index.html` directly remains supported without a running VNFairy server.

The editable `.vnfairy` source archive is a separate format intended for backups and moving a project between VNFairy workspaces. It is not a playable-game package.

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
| `POST` | `/api/project/duplicate?id=<id>` | Duplicate a project under a new ID |
| `POST` | `/api/project/rename?id=<id>` | Change a story's display title |
| `POST` | `/api/project/archive?id=<id>` | Archive or unarchive a project |
| `GET` | `/api/project/recovery?id=<id>` | List rolling recovery versions |
| `POST` | `/api/project/restore?id=<id>` | Restore a recovery version |
| `GET` | `/api/project/export?id=<id>` | Download an editable `.vnfairy` source archive |
| `POST` | `/api/project/import` | Import a `.vnfairy` source archive |
| `GET` | `/api/assets?project=<id>` | List assets for a project |
| `POST` | `/api/upload` | Upload an asset (base64 JSON body); the server validates filename, extension, detected type, size and resolved path boundaries |
| `POST` | `/api/asset/delete` | Delete an asset file |
| `GET` | `/api/package/check?id=<id>` | Preflight asset sizes and return packaging warnings |
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

A special exception permits visual novels exported using the **Export game** feature (either via the Designer or via the API) to be distributed under any license, including proprietary licenses, when they include an unmodified copy of the VNFairy Player. This exception does not affect the licensing of VNFairy itself or any modifications to the VNFairy Player, which remain licensed under the GNU GPL.

See `LICENSE.txt` for the full license and exception.

---
