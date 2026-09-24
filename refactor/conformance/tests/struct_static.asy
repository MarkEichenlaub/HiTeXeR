// static struct members
struct Stat {
  static int count = 0;
  static int next() { return ++count; }
}
write(Stat.count);
write(Stat.next());
write(Stat.next());
write(Stat.count);
