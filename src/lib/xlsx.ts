import {deflateRawSync} from "node:zlib";

type Cell=string|number|null|undefined;
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;})();
function crc32(data:Buffer){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function xml(value:Cell){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");}
function column(index:number){let label="";for(index++;index;index=Math.floor((index-1)/26))label=String.fromCharCode(65+(index-1)%26)+label;return label;}
function makeZip(files:Array<[string,string]>){
 const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const [name,content] of files){const nameBuf=Buffer.from(name);const raw=Buffer.from(content);const compressed=deflateRawSync(raw);const crc=crc32(raw);const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(8,8);head.writeUInt32LE(crc,14);head.writeUInt32LE(compressed.length,18);head.writeUInt32LE(raw.length,22);head.writeUInt16LE(nameBuf.length,26);local.push(head,nameBuf,compressed);const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(8,10);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(compressed.length,20);dir.writeUInt32LE(raw.length,24);dir.writeUInt16LE(nameBuf.length,28);dir.writeUInt32LE(offset,42);central.push(dir,nameBuf);offset+=head.length+nameBuf.length+compressed.length;}
 const directory=Buffer.concat(central);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
export function createXlsx(headers:string[],rows:Cell[][],sheetName="Report"){
 const all=[headers,...rows];const sheetRows=all.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,index)=>{const ref=`${column(index)}${rowIndex+1}`;if(typeof value==="number"&&Number.isFinite(value))return `<c r="${ref}"><v>${value}</v></c>`;return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;}).join("")}</row>`).join("");
 const safeName=xml(sheetName.slice(0,31));const files:Array<[string,string]>=[
  ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
  ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ["xl/workbook.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
  ["xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ["xl/worksheets/sheet1.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`],
 ];return makeZip(files);
}
