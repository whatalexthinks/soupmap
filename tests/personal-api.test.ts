import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { Pool } from "pg";
import { ListStore } from "../server/lists.ts";
import { personalApi } from "../server/api.ts";

test("personal list API enforces ownership, input validation and explicit non-destructive import",
  {skip:!process.env.DATABASE_URL}, async()=>{
  const db=new Pool({connectionString:process.env.DATABASE_URL,max:2});
  const store=new ListStore(db);
  const alice=`test-owner-${randomUUID()}`,bob=`test-owner-${randomUUID()}`;
  const app=express();
  app.use(express.json());
  app.use("/api",personalApi(store,req=>req.get("x-test-owner")??null,new Set(["miso-soup"])));
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const port=(server.address() as {port:number}).port;
  async function request(path:string,method="GET",body?:unknown,owner:string|null=alice,origin?:string){
    const response=await fetch(`http://127.0.0.1:${port}/api${path}`,{
      method,headers:{"Content-Type":"application/json",...(owner?{"x-test-owner":owner}:{}),...(origin?{Origin:origin}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    return {status:response.status,data:await response.json()};
  }
  try {
    assert.equal((await request("/me","GET",undefined,null)).status,401);
    const initial=await request("/me");
    const saved=initial.data.lists[0];
    assert.equal(saved.kind,"saved");
    assert.equal((await request("/lists","POST",{name:"  Tokyo weekend  "})).status,201);
    const result=await request("/me");
    const custom=result.data.lists.find((list:{kind:string})=>list.kind==="custom");
    assert.equal(custom.name,"Tokyo weekend");
    assert.equal((await request(`/lists/${custom.id}/items`,"PUT",{ids:["afuri-ebisu"],add:true})).status,200);
    assert.equal((await request(`/lists/${custom.id}`,"PATCH",{name:"Changed"},bob)).status,404);
    assert.equal((await request(`/lists/${custom.id}/items`,"PUT",{ids:["ginza-kagari"],add:true},bob)).status,404);
    assert.equal((await request(`/lists/${custom.id}`,"DELETE",{},bob)).status,404);
    assert.equal((await request("/me","GET",undefined,bob)).data.lists.some((list:{id:string})=>list.id===custom.id),false);
    assert.equal((await request("/lists","POST",{name:""})).status,400);
    assert.equal((await request("/lists","POST",{name:"Valid",owner_id:bob})).status,400);
    assert.equal((await request("/lists","POST",{name:"CSRF"},alice,"https://malicious.example")).status,403);
    assert.equal((await request(`/lists/${saved.id}`,"DELETE",{})).status,404);
    assert.equal((await request(`/lists/${custom.id}/items`,"PUT",{ids:["invented-shop"],add:true})).status,400);
    await request("/saved/ginza-kagari","PUT",{saved:true});
    await request("/import-saves","POST",{ids:["afuri-ebisu"],add:true});
    await request("/import-saves","POST",{ids:["afuri-ebisu"],add:true});
    const after=(await request("/me")).data.lists.find((list:{kind:string})=>list.kind==="saved");
    assert.deepEqual(new Set(after.ids),new Set(["ginza-kagari","afuri-ebisu"]));
    await request(`/lists/${custom.id}`,"PATCH",{name:"Renamed"});
    assert.equal((await request("/me")).data.lists.find((list:{id:string})=>list.id===custom.id).name,"Renamed");
    assert.equal((await request(`/lists/${custom.id}`,"DELETE",{})).status,200);
    assert.equal((await request("/me")).data.lists.find((list:{kind:string})=>list.kind==="saved").ids.length,2);
    await request("/saved/afuri-ebisu","PUT",{saved:false});
    assert.deepEqual((await request("/me")).data.lists.find((list:{kind:string})=>list.kind==="saved").ids,["ginza-kagari"]);
    const visit={date:"2026-01-01",bowl:"Ramen",note:"Private memory",wouldReturn:true};
    assert.equal((await request("/personal/visit/afuri-ebisu","PUT",visit,null)).status,401);
    assert.equal((await request("/personal/visit/afuri-ebisu","PUT",visit)).status,200);
    assert.equal((await request("/personal/visit","GET",undefined,bob)).data.entries.length,0,"another owner cannot read memories");
    assert.equal((await request("/personal/visit")).data.entries[0].value.note,visit.note);
    assert.equal((await request("/personal/recipe/miso-soup","PUT",{saved:true,note:"Less salt"})).status,200);
    assert.equal((await request("/personal/recipe/invented","PUT",{saved:true,note:""})).status,400);
    assert.equal((await request("/personal/visit/not-a-shop","PUT",visit)).status,400);
    assert.equal((await request("/personal/visit/afuri-ebisu","PUT",{...visit,owner_id:bob})).status,400);
    assert.equal((await request("/personal/visit/afuri-ebisu","DELETE",{},bob)).status,200);
    assert.equal((await request("/personal/visit")).data.entries.length,1,"another owner cannot delete memories");
    assert.equal((await request("/personal/visit/afuri-ebisu","DELETE",{})).status,200);
    assert.equal((await request("/personal/visit")).data.entries.length,0);
  } finally {
    await db.query("DELETE FROM personal_entries WHERE owner_id=ANY($1::text[])",[[alice,bob]]);
    await db.query("DELETE FROM personal_lists WHERE owner_id=ANY($1::text[])",[[alice,bob]]);
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await store.close();
  }
});
