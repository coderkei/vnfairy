# VNFairy REST API

The local Node.js server exposes the JSON API used by the Designer. Start it with `node server.js`; it binds to `127.0.0.1:3000` by default. All non-API paths are served as static files from the project root.

The examples below use `<id>` for a project ID. Responses are JSON unless noted otherwise.

## Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List projects |
| `GET` | `/api/project?id=<id>` | Load a project with its scenes merged |
| `POST` | `/api/project?id=<id>` | Save a project |
| `POST` | `/api/project/create` | Create a project |
| `POST` | `/api/project/delete?id=<id>` | Delete a project |
| `POST` | `/api/project/duplicate?id=<id>` | Duplicate a project |
| `POST` | `/api/project/rename?id=<id>` | Change a project's display title |
| `POST` | `/api/project/archive?id=<id>` | Archive or unarchive a project |
| `GET` | `/api/project/recovery?id=<id>` | List recovery snapshots |
| `POST` | `/api/project/restore?id=<id>` | Restore a recovery snapshot |
| `GET` | `/api/project/export?id=<id>` | Download an editable `.vnfairy` source archive |
| `POST` | `/api/project/import` | Import an editable `.vnfairy` source archive |

## Assets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assets?project=<id>` | List the project's registered assets and usage |
| `POST` | `/api/upload` | Upload an asset using a base64 JSON body |
| `POST` | `/api/asset/delete` | Delete an asset file |

Uploads are validated against the supported asset type, filename, extension, detected media type, size limit, and resolved project path. Asset types are backgrounds, characters, music, voice/sound, and video.

## Packaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/package/check?id=<id>` | Preflight asset sizes and return packaging warnings |
| `POST` | `/api/package?id=<id>` | Build a playable game ZIP |

The package endpoint includes the standalone Player, engine assets, project data, uploaded media, and per-scene wrappers for offline playback. The package is distinct from an editable `.vnfairy` source archive.

## Running on another host or port

```bash
node server.js --port=8080 --host=0.0.0.0
```

The server also accepts positional port and host values for compatibility:

```bash
node server.js 8080 192.168.1.100
```

See [`server.js`](../server.js) for the implementation and [`FORMAT.md`](FORMAT.md) for the project and scene data model.
