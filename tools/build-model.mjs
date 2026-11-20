// Builds assets/concorde.json from the Sketchfab glTF download (thomas333, CC BY 4.0).
// usage: node tools/build-model.mjs <dir with scene.gltf> <out dir>
// Colour textures capped at 2048 px as JPEG; geometry welded and quantized.
// (meshopt simplification was tried: this model's triangles barely share vertices, so it removes almost nothing.)
// Node names are kept: main.js finds the visor, gear and gear doors by name.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, quantize, dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const [src, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.join(src, 'scene.gltf'));

// main.js keeps only each material's colour map (it upgrades the materials itself), so the fuselage's
// normal and metal/roughness maps, and the extra UV sets they used, are dropped.
for (const m of doc.getRoot().listMaterials()) { m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); }
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives())
  for (const sem of ['TEXCOORD_1', 'TEXCOORD_2', 'TANGENT']) if (prim.getAttribute(sem)) prim.setAttribute(sem, null);

await doc.transform(
  dedup(), prune(),
  weld(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [2048, 2048], quality: 86,
    slots: /^baseColorTexture$/ }),
  quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14 }),
  prune(),
);

fs.mkdirSync(out, { recursive: true });
const glb = await io.writeBinary(doc);
fs.writeFileSync(path.join(out, 'concorde.glb'), glb);
fs.writeFileSync(path.join(out, 'concorde.json'), JSON.stringify([Buffer.from(glb).toString('base64')]));
console.log('glb', (glb.byteLength / 1e6).toFixed(2), 'MB');
