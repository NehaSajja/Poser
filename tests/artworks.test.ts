import test from 'node:test';
import assert from 'node:assert/strict';
import {museumImageUrl,rankedArtworks,type Artwork} from '../lib/artwork-types.ts';
const candidate:Artwork={id:'met-1',title:'Trusted title',artist:'Known artist',date:'1900',medium:'Ink',source:'The Met',sourceUrl:'https://www.metmuseum.org/art/collection/search/1',image:'/api/assets/id/art-met-1.jpg',credit:''};
test('art ranking uses only downloaded catalogue IDs and preserves source metadata',()=>{
 const result=rankedArtworks([{id:'invented',score:99,hasFigure:true},{id:'met-1',score:71.3,hasFigure:true,title:'Invented title',reason:'Similar elbow, different leg.',box:[.1,.2,.9,.8]},{id:'met-1',score:100,hasFigure:true}],[candidate]);
 assert.equal(result.length,1);assert.equal(result[0].score,71);assert.equal(result[0].title,'Trusted title');assert.deepEqual(result[0].box,[.1,.2,.9,.8]);
});
test('unrelated images, invalid scores and invented boxes do not become confident matches',()=>{
 for(const row of [{score:101,hasFigure:true},{score:NaN,hasFigure:true},{score:60,hasFigure:false},{score:20,hasFigure:true},{score:'90',hasFigure:true}])assert.deepEqual(rankedArtworks([{id:'met-1',...row}],[candidate]),[]);
 assert.equal(rankedArtworks([{id:'met-1',score:60,hasFigure:true,box:[.9,0,.1,1]}],[candidate])[0].box,undefined);
});
test('museum image requests allow only the official HTTPS image hosts',()=>{
 assert.match(museumImageUrl('https://openaccess-cdn.clevelandart.org/1/1_web.jpg'),/clevelandart/);
 assert.match(museumImageUrl('https://images.metmuseum.org/CRDImages/a.jpg'),/metmuseum/);
 for(const u of ['http://images.metmuseum.org/a.jpg','https://images.metmuseum.org.evil.test/x','https://user:pass@www.artic.edu/x','https://127.0.0.1/private','https://www.artic.edu:444/x'])assert.throws(()=>museumImageUrl(u));
});
