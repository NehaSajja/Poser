import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiImageData } from '../lib/gemini-image.ts';

test('Gemini extraction ignores thought images and uses the final image',()=>{
  assert.equal(geminiImageData({candidates:[{finishReason:'STOP',content:{parts:[
    {thought:true,inlineData:{mimeType:'image/png',data:'intermediate'}},
    {text:'The reference is ready.'},
    {inlineData:{mimeType:'image/png',data:'final'}}
  ]}}]}),'data:image/png;base64,final');
});
test('Missing, blocked and incomplete images cannot proceed to reconstruction',()=>{
  assert.throws(()=>geminiImageData({promptFeedback:{blockReason:'SAFETY'}}));
  assert.throws(()=>geminiImageData({candidates:[{finishReason:'MAX_TOKENS'}]}));
  assert.throws(()=>geminiImageData({candidates:[{content:{parts:[{text:'No image'}]}}]}));
  assert.throws(()=>geminiImageData({candidates:[{content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:'thought'}}]}}]}));
});
