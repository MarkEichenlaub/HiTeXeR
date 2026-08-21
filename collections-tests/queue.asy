// asy 3.11 collections.queue
from collections.queue(T=int) access Queue_T, makeQueue, makeNaiveQueue, makeLinkedQueue;

int[] a = {1, 2, 3};
Queue_T q = makeQueue(a);
write(q.size());
write(q.peek());
write(q.pop());
write(q.pop());
q.push(10);
write(q.size());
for (int x : q) write(x);
write(q.pop());
write(q.pop());
write(q.size());

Queue_T nq = makeNaiveQueue(new int[0]);
nq.push(4);
nq.push(5);
write(nq.pop());
write(nq.size());

int[] b = {7, 8};
Queue_T lq = makeLinkedQueue(b);
lq.push(9);
for (int x : lq) write(x);
