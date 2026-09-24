//TeXeR source: https://artofproblemsolving.com/texer/gfxfahuc
//recommended size setup when using images
real scale = 0.02;
unitsize(scale*cm); //1 point is 1 cm

pair dim_ice_cream = (151,400);
real true_height = 100;
real h = true_height*scale;

fill(box((-200,-100),(400,200)), cyan);

string height = "height="+string(h)+"cm";
string ice_cream = graphic("/var/www/cdn/school/crypt/00540-e12599cedadfdc40445dca22ddd227e6417975d2/files/ice_cream.eps", height);
label(ice_cream, (-100,0));
layer();

path room = (0,70)--(0,0)--(300,0)--(300,220)--(0,220)--(0,150);
pair roomShift = (100,-100);
fill(shift(roomShift)*room--cycle, gray);
draw(shift(roomShift)*room, linewidth(2pt));

label("room",roomShift+(150,0),S);
label("window",roomShift + (0,150),NE);

pair S = (-100,40);
pair C = (-100,20);
pair V = (-100,0);
pair B = roomShift + (300,110);

// --- direct sunlight ray ---
pen sunpen = white+linewidth(2pt);
path sun = (-100,200)--(0,0);
pen sunpen = white+linewidth(2pt);
draw(shift(C)*sun, p = sunpen);

// --- diffuse reflection from C ---
int N = 400;
real L = 600;

// revised hit test: works for any starting x,y
bool hitsSolidWall(pair q) {
  pair r = q - roomShift;
  if (r.y >= 0 && r.y <= 220) {
    if (abs(r.x) < 0.5 && (r.y <= 70 || r.y >= 150)) return true; // left wall excluding window
    if (abs(r.x - 300) < 0.5) return true; // right wall
  }
  if (abs(r.y) < 0.5 && r.x >= 0 && r.x <= 300) return true; // bottom
  if (abs(r.y - 220) < 0.5 && r.x >= 0 && r.x <= 300) return true; // top
  return false;
}

pair limitRay(pair p, pair dir) {
  real step = 0.5;
  pair last = p;
  for (real t = 0; t < L; t += step) {
    pair test = p + dir*t;
    if (test.x < -200 || test.x > 600 || test.y < -100 || test.y > 200)
      return last;
    if (hitsSolidWall(test))
      return last;
    last = test;
  }
  return p + L*dir;
}

void drawDiffuse(pair center, pen p) {
  for (int i=0; i<N; ++i) {
    real ang = 360*i/N;
    pair dirv = dir(ang);
    pair endp = limitRay(center, dirv);
    draw(center--endp, p);
  }
}

// draw diffuse rays from C in dark brown
pen brown = rgb(0.4, 0.2, 0.05) + linewidth(0.7pt);
drawDiffuse(C, brown);

draw(shift(roomShift)*room, linewidth(2pt));