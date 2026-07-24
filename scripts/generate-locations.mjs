import fs from "node:fs";import cities from "all-the-cities";
const names=new Intl.DisplayNames(["en"],{type:"region"}),groups=new Map();
for(const row of cities){if(!row.country||!row.name)continue;if(!groups.has(row.country))groups.set(row.country,new Set());groups.get(row.country).add(row.name.trim())}
const output=[...groups].map(([code,items])=>({code,country:names.of(code)||code,cities:[...items].sort((a,b)=>a.localeCompare(b,"en"))})).sort((a,b)=>a.country.localeCompare(b.country,"en"));
fs.mkdirSync("public/data",{recursive:true});fs.writeFileSync("public/data/countries-cities.json",JSON.stringify(output));
console.log(`Generated ${output.length} countries and ${output.reduce((sum,item)=>sum+item.cities.length,0)} cities.`);
