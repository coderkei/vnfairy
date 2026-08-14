# VNFairy project and scene format

VNFairy stores editable projects as JSON files and keeps each scene in its own file. This page is a concise reference for the on-disk shape; the application also validates and migrates legacy artifacts when they are loaded.

## Directory layout

```text
data/projects/<project-id>/
├── project.json
├── scenes/
│   └── <scene-id>.json
└── assets/
    ├── bg/
    ├── char/
    ├── music/
    ├── sound/
    └── video/
```

`project.json` contains project metadata, configuration, asset registries, presets, and a scene index. The full scene content lives in `scenes/<scene-id>.json`.

## Project metadata

Project artifacts carry explicit format and runtime metadata:

```json
{
  "id": "demo",
  "artifactType": "vnfairy-project",
  "schemaVersion": 1,
  "engineVersion": "2.0.0",
  "createdWithVersion": "2.0.0",
  "title": "VNFairy Demo",
  "author": "coderkei"
}
```

The project configuration also contains novel-wide settings such as kinetic mode, title screen, credits, and typed variable definitions. Projects may contain asset registries and reusable dialogue-layout or character-pose presets.

## Scene files

This is a minimal illustrative scene. Real scenes may include additional editor metadata, cutscene settings, bookmarks, notes, tags, and status fields.

```json
{
  "id": "scene_1",
  "name": "Introduction",
  "background": "data/projects/demo/assets/bg/forest.png",
  "music": "data/projects/demo/assets/music/theme.mp3",
  "dialogue": [
    {
      "id": "line_scene_1_1_demo",
      "speaker": "narrator",
      "text": "It was a quiet morning.",
      "layout": {
        "left": null,
        "center": null,
        "right": null
      },
      "voice": ""
    },
    {
      "id": "line_scene_1_2_demo",
      "speaker": "aria",
      "text": "Hello there!",
      "layout": {
        "left": {
          "character": "aria",
          "expression": "happy"
        },
        "center": null,
        "right": null
      }
    }
  ],
  "choices": [
    {
      "id": "choice_1",
      "text": "Say hello back",
      "targetSceneId": "scene_2",
      "conditions": [],
      "actions": []
    }
  ],
  "nextSceneId": "scene_2",
  "conditionalBranches": []
}
```

### Common scene fields

- `background` and `music` refer to registered or packaged project assets.
- `dialogue` is an ordered list of lines. Each line has a stable `id` used by the editor and migrations.
- `layout.left`, `layout.center`, and `layout.right` describe character placement for a line. A slot may be `null` or contain a character and expression.
- `choices` routes the player to another scene. A choice may include `conditions` and `actions` for project logic.
- `nextSceneId` is the normal linear destination after the scene ends.
- `conditionalBranches` can override the normal destination when a condition matches.

## Project logic

Project variables support four types:

- `boolean`
- `number`
- `text`
- `inventory`

Conditions can inspect variables or whether a choice was selected. Actions can set, increment, decrement, toggle, or compare values. The supported operators depend on the variable type and are implemented in [`shared/logic-model.js`](../shared/logic-model.js).

## Versioning and saves

`schemaVersion` selects an explicit migration chain. `engineVersion` identifies the runtime that last wrote an artifact, while `createdWithVersion` records the original authoring/runtime version. Legacy projects are migrated in memory and written through the validated save path.

Player saves are separate artifacts. In addition to their own version metadata, they include `projectId`, `projectSchemaVersion`, `savedAt`, and a nested `state` object so progress remains associated with the project even if its title changes.

The migration and validation implementations are in [`shared/migrations.js`](../shared/migrations.js), [`shared/versioning.js`](../shared/versioning.js), and [`shared/validator.js`](../shared/validator.js).
