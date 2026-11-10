/** Keep database publication serial without holding a connection while queued.
 * A rejected publication must not poison later independent sources. */
export function serialPublisher() {
 let tail: Promise<unknown> = Promise.resolve();
 return <T>(publish: () => Promise<T>): Promise<T> => {
  const result = tail.then(publish);
  tail = result.catch(() => undefined);
  return result;
 };
}

/** Rolling bounded lanes: a slow source never stalls unrelated available lanes. */
export async function settledConcurrentMap<T,R>(items:readonly T[],limit:number,map:(item:T)=>Promise<R>):Promise<PromiseSettledResult<R>[]> {
 if(!Number.isInteger(limit)||limit<1)throw new Error('Concurrency must be a positive integer.');
 const results:PromiseSettledResult<R>[]=new Array(items.length);
 let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(next<items.length){
   const index=next++;
   try{results[index]={status:'fulfilled',value:await map(items[index])};}
   catch(reason){results[index]={status:'rejected',reason};}
  }
 }));
 return results;
}
