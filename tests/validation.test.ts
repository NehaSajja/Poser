import test from "node:test";
import assert from "node:assert/strict";
import {parseImage,safeAssetUrl,sameOrigin,validId} from "../lib/validation.ts";

test("only actual supported image bytes are accepted",()=>{
  const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5m0AAAAASUVORK5CYII=";
  assert.equal(parseImage(png).mime,"image/png");
  assert.throws(()=>parseImage("data:image/png;base64,SGVsbG8="));
  assert.throws(()=>parseImage("data:image/svg+xml;base64,PHN2Zy8+"));
  assert.throws(()=>parseImage("https://example.com/image.png"));
});
test("provider downloads cannot be redirected to arbitrary or local hosts",()=>{
  assert.equal(safeAssetUrl("https://v3b.fal.media/files/body.glb").hostname,"v3b.fal.media");
  for(const url of ["http://v3b.fal.media/a","https://fal.media.attacker.test/a","https://127.0.0.1/a","file:///etc/passwd"]){assert.throws(()=>safeAssetUrl(url));}
});
test("local mutation routes reject foreign origins and host rebinding",()=>{
  sameOrigin(new Request("http://localhost:3000/api/runs",{headers:{host:"localhost:3000",origin:"http://localhost:3000"}}));
  assert.throws(()=>sameOrigin(new Request("http://localhost:3000/api/runs",{headers:{host:"localhost:3000",origin:"https://example.com"}})));
  assert.throws(()=>sameOrigin(new Request("http://attacker.test/api/runs",{headers:{host:"attacker.test"}})));
});
test("run paths reject traversal",()=>{
  assert.equal(validId("6dddbbeb-4ec8-4371-9f9b-351eeaaaf446"),"6dddbbeb-4ec8-4371-9f9b-351eeaaaf446");
  assert.throws(()=>validId("../../connections.json"));
});
