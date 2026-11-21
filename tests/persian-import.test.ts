import assert from'node:assert/strict';
import test from'node:test';
import{parseBlock}from'../src/structured-import.ts';
import{persianImportIssue}from'../src/persian-import.ts';

test('Persian import accepts a source title for matching but rejects English prose',()=>{
 const good=parseBlock('# راهنمای کتاب\n\n## نمای کلی\n\nاین کتاب دربارهٔ رابطه و زندگی مشترک سخن می‌گوید.\n\n## فصل ۱: رابطه\n\nعنوان اصلی: The First Chapter\n\nنویسنده از داستان یک زوج برای روشن‌کردن موضوع آغاز می‌کند.',null,'fa');
 assert.equal(persianImportIssue(good),null);
 const mixed=parseBlock('# راهنمای کتاب\n\n## نمای کلی\n\nاین کتاب دربارهٔ رابطه است.\n\n## فصل ۱: رابطه\n\nThe author begins by telling a detailed story about a couple learning to speak openly.',null,'fa');
 assert.match(persianImportIssue(mixed)||'',/still in English/);
 const english=parseBlock('# Guide\n\n## Overview\n\nThe book explains how a relationship changes over time.\n\n## Chapter 1: Love\n\nA long English paragraph follows here.',null,'fa');
 assert.ok(persianImportIssue(english));
});

test('Persian import does not refuse an original-title line or one stray English paragraph, only a mostly English summary',()=>{
 const body=Array.from({length:12},(_,i)=>'این بند شمارهٔ '+i+' دربارهٔ موضوع کتاب سخن می‌گوید و ادامهٔ استدلال نویسنده را شرح می‌دهد.').join('\n\n');
 const withTitle=parseBlock('# راهنمای کتاب\n\n## نمای کلی\n\nاین کتاب دربارهٔ رابطه است.\n\n## مقدمه\n\nOriginal title: Introduction: Listening to the text\n\n'+body,null,'fa');
 assert.equal(persianImportIssue(withTitle),null);
 const oneStray=parseBlock('# راهنمای کتاب\n\n## نمای کلی\n\nاین کتاب دربارهٔ رابطه است.\n\n## فصل ۱: رابطه\n\n'+body+'\n\nThe author begins by telling a detailed story about a couple learning to speak openly with each other.',null,'fa');
 assert.equal(persianImportIssue(oneStray),null);
});
