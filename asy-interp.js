// asy-interp.js – Client-side Asymptote interpreter for HiTeXeR
// Produces SVG directly from Asymptote code without server round-trip.
'use strict';
(function() {

// ============================================================
// Token Types
// ============================================================
const T = {
  NUMBER:'NUMBER', STRING:'STRING', IDENT:'IDENT', BOOL:'BOOL',
  PLUS:'+', MINUS:'-', STAR:'*', SLASH:'/', CARET:'^', PERCENT:'%',
  HATHAT:'^^',
  DASHDASH:'--', DOTDOT:'..', DOT:'.', COMMA:',', SEMI:';', COLON:':',
  LPAREN:'(', RPAREN:')', LBRACE:'{', RBRACE:'}', LBRACKET:'[', RBRACKET:']',
  ASSIGN:'=', EQ:'==', NEQ:'!=', LT:'<', GT:'>', LE:'<=', GE:'>=',
  AND:'&&', OR:'||', NOT:'!',
  PLUSASSIGN:'+=', MINUSASSIGN:'-=', STARASSIGN:'*=', SLASHASSIGN:'/=',
  QUESTION:'?',
  HASH:'#',
  ARROW:'=>',
  DOTDOTDOT:'...',
  PLUSPLUS:'++',
  MINUSMINUS_OP:'--_op', // decrement op (distinguished from path join --)
  EOF:'EOF',
};

const KEYWORDS = new Set([
  'if','else','for','while','do','return','break','continue',
  'new','null','true','false','cycle',
  'int','real','pair','triple','string','bool','pen','path','guide',
  'picture','transform','void','var',
  'import','access','from','include','static','typedef','struct',
  'operator','cast','explicit',
]);

const TYPE_NAMES = new Set([
  'int','real','pair','triple','string','bool','bool3','pen','path','path3','guide',
  'picture','transform','void','var','Label','file',
  'projection','revolution','surface','material',
]);

// ============================================================
// Lexer
// ============================================================
function lex(source) {
  const tokens = [];
  let pos = 0, line = 1, col = 1;
  const len = source.length;

  function ch() { return pos < len ? source[pos] : '\0'; }
  function peek(offset) { return pos+offset < len ? source[pos+offset] : '\0'; }
  function advance() { if (source[pos] === '\n') { line++; col=1; } else { col++; } pos++; }
  function add(type, value) { tokens.push({type, value, line, col}); }

  while (pos < len) {
    // Skip whitespace
    if (ch() === ' ' || ch() === '\t' || ch() === '\r' || ch() === '\n') { advance(); continue; }

    // Line comments
    if (ch() === '/' && peek(1) === '/') {
      while (pos < len && ch() !== '\n') advance();
      continue;
    }
    // Block comments
    if (ch() === '/' && peek(1) === '*') {
      advance(); advance();
      while (pos < len && !(ch() === '*' && peek(1) === '/')) advance();
      if (pos < len) { advance(); advance(); }
      continue;
    }

    const startLine = line, startCol = col;

    // Numbers
    if ((ch() >= '0' && ch() <= '9') || (ch() === '.' && peek(1) >= '0' && peek(1) <= '9')) {
      let num = '';
      while (pos < len && ch() >= '0' && ch() <= '9') { num += ch(); advance(); }
      if (ch() === '.' && peek(1) !== '.') {
        num += ch(); advance();
        while (pos < len && ch() >= '0' && ch() <= '9') { num += ch(); advance(); }
      }
      if (ch() === 'e' || ch() === 'E') {
        num += ch(); advance();
        if (ch() === '+' || ch() === '-') { num += ch(); advance(); }
        while (pos < len && ch() >= '0' && ch() <= '9') { num += ch(); advance(); }
      }
      tokens.push({type:T.NUMBER, value:parseFloat(num), line:startLine, col:startCol});
      continue;
    }

    // Strings
    if (ch() === '"') {
      advance(); let s = '';
      while (pos < len && ch() !== '"') {
        if (ch() === '\\') {
          advance();
          if (ch() === 'n') { s += '\n'; } else if (ch() === 't') { s += '\t'; }
          else if (ch() === '\\') { s += '\\'; } else if (ch() === '"') { s += '"'; }
          else { s += '\\'; s += ch(); } // preserve backslash for LaTeX etc.
        } else { s += ch(); }
        advance();
      }
      if (pos < len) advance(); // closing quote
      tokens.push({type:T.STRING, value:s, line:startLine, col:startCol});
      continue;
    }
    // Single-quoted strings
    if (ch() === "'") {
      advance(); let s = '';
      while (pos < len && ch() !== "'") {
        if (ch() === '\\') {
          advance();
          if (ch() === 'n') { s += '\n'; } else if (ch() === 't') { s += '\t'; }
          else if (ch() === '\\') { s += '\\'; } else if (ch() === "'") { s += "'"; }
          else { s += '\\'; s += ch(); }
        } else { s += ch(); }
        advance();
      }
      if (pos < len) advance();
      tokens.push({type:T.STRING, value:s, line:startLine, col:startCol});
      continue;
    }

    // Identifiers and keywords
    if ((ch() >= 'a' && ch() <= 'z') || (ch() >= 'A' && ch() <= 'Z') || ch() === '_') {
      let id = '';
      while (pos < len && ((ch() >= 'a' && ch() <= 'z') || (ch() >= 'A' && ch() <= 'Z') || (ch() >= '0' && ch() <= '9') || ch() === '_')) {
        id += ch(); advance();
      }
      if (id === 'true' || id === 'false') {
        tokens.push({type:T.BOOL, value: id === 'true', line:startLine, col:startCol});
      } else if (id === 'cycle') {
        tokens.push({type:T.IDENT, value:'cycle', line:startLine, col:startCol});
      } else {
        tokens.push({type:T.IDENT, value:id, line:startLine, col:startCol});
      }
      continue;
    }

    // Operators and delimiters
    const c = ch();
    switch (c) {
      case '+': advance(); if(ch()==='='){advance();add(T.PLUSASSIGN,'+=');}else if(ch()==='+'){advance();add(T.PLUSPLUS,'++');}else{add(T.PLUS,'+');} break;
      case '-': advance();
        if(ch()==='='){advance();add(T.MINUSASSIGN,'-=');}
        else if(ch()==='-'){advance();if(ch()==='-'){advance();}add(T.DASHDASH,'--');} // --- is same as --
        else if(ch()==='>'){advance();add(T.ARROW,'=>');}
        else{add(T.MINUS,'-');}
        break;
      case '*': advance(); if(ch()==='='){advance();add(T.STARASSIGN,'*=');}else if(ch()==='*'){advance();add(T.CARET,'^');}else{add(T.STAR,'*');} break;
      case '/': advance(); if(ch()==='='){advance();add(T.SLASHASSIGN,'/=');}else{add(T.SLASH,'/');} break;
      case '^': advance(); if(ch()==='^'){advance();add(T.HATHAT,'^^');}else{add(T.CARET,'^');} break;
      case '%': advance(); add(T.PERCENT,'%'); break;
      case '(': advance(); add(T.LPAREN,'('); break;
      case ')': advance(); add(T.RPAREN,')'); break;
      case '{': advance(); add(T.LBRACE,'{'); break;
      case '}': advance(); add(T.RBRACE,'}'); break;
      case '[': advance(); add(T.LBRACKET,'['); break;
      case ']': advance(); add(T.RBRACKET,']'); break;
      case ',': advance(); add(T.COMMA,','); break;
      case ';': advance(); add(T.SEMI,';'); break;
      case ':': advance(); add(T.COLON,':'); break;
      case '#': advance(); add(T.HASH,'#'); break;
      case '?': advance(); add(T.QUESTION,'?'); break;
      case '=': advance(); if(ch()==='='){advance();add(T.EQ,'==');}else{add(T.ASSIGN,'=');} break;
      case '!': advance(); if(ch()==='='){advance();add(T.NEQ,'!=');}else{add(T.NOT,'!');} break;
      case '<': advance(); if(ch()==='='){advance();add(T.LE,'<=');}else{add(T.LT,'<');} break;
      case '>': advance(); if(ch()==='='){advance();add(T.GE,'>=');}else{add(T.GT,'>');} break;
      case '&': advance(); if(ch()==='&'){advance();add(T.AND,'&&');}else{add(T.AND,'&');} break;
      case '|': advance(); if(ch()==='|'){advance();add(T.OR,'||');}else{add(T.OR,'|');} break;
      case '.': advance();
        if(ch()==='.'){advance();
          if(ch()==='.'){advance();add(T.DOTDOTDOT,'...');}
          else{add(T.DOTDOT,'..');}
        } else {add(T.DOT,'.');}
        break;
      default: advance(); break; // skip unknown
    }
  }
  tokens.push({type:T.EOF, value:null, line, col});
  return tokens;
}

// ============================================================
// Parser - Recursive descent with Pratt precedence
// ============================================================

// AST Node constructors
function NumberLit(value,line) { return {type:'NumberLit',value,line}; }
function StringLit(value,line) { return {type:'StringLit',value,line}; }
function BoolLit(value,line) { return {type:'BoolLit',value,line}; }
function NullLit(line) { return {type:'NullLit',line}; }
function Identifier(name,line) { return {type:'Identifier',name,line}; }
function PairLit(x,y,line) { return {type:'PairLit',x,y,line}; }
function TripleLit(x,y,z,line) { return {type:'TripleLit',x,y,z,line}; }
function ArrayExpr(elements,line) { return {type:'ArrayExpr',elements,line}; }
function BinaryOp(op,left,right,line) { return {type:'BinaryOp',op,left,right,line}; }
function UnaryOp(op,operand,line) { return {type:'UnaryOp',op,operand,line}; }
function FuncCall(callee,args,line) { return {type:'FuncCall',callee,args,line}; }
function MemberAccess(object,member,line) { return {type:'MemberAccess',object,member,line}; }
function ArrayAccess(object,index,line) { return {type:'ArrayAccess',object,index,line}; }
function TernaryOp(cond,then_,else_,line) { return {type:'TernaryOp',cond,then:then_,else:else_,line}; }
function CastExpr(targetType,expr,line) { return {type:'CastExpr',targetType,expr,line}; }
function NamedArg(name,value,line) { return {type:'NamedArg',name,value,line}; }
function VarDecl(varType,name,init,line) { return {type:'VarDecl',varType,name,init,line}; }
function Assignment(target,op,value,line) { return {type:'Assignment',target,op,value,line}; }
function ExprStmt(expr,line) { return {type:'ExprStmt',expr,line}; }
function Block(stmts,line) { return {type:'Block',stmts,line}; }
function IfStmt(cond,then_,else_,line) { return {type:'IfStmt',cond,then:then_,else:else_,line}; }
function ForStmt(init,cond,update,body,line) { return {type:'ForStmt',init,cond,update,body,line}; }
function WhileStmt(cond,body,line) { return {type:'WhileStmt',cond,body,line}; }
function DoWhileStmt(body,cond,line) { return {type:'DoWhileStmt',body,cond,line}; }
function ReturnStmt(value,line) { return {type:'ReturnStmt',value,line}; }
function BreakStmt(line) { return {type:'BreakStmt',line}; }
function ContinueStmt(line) { return {type:'ContinueStmt',line}; }
function FuncDecl(retType,name,params,body,line) { return {type:'FuncDecl',retType,name,params,body,line}; }
function ImportStmt(module,line) { return {type:'ImportStmt',module,line}; }
function PathExpr(nodes,line) { return {type:'PathExpr',nodes,line}; }
// PathExpr nodes: {point, join:'--'|'..', tension:{in,out}, dirIn, dirOut, isCycle}

function parse(tokens) {
  let pos = 0;

  function cur() { return tokens[pos]; }
  function at(type) { return cur().type === type; }
  function atVal(type,val) { return cur().type === type && cur().value === val; }
  function eat(type) {
    if (!at(type)) throw new Error(`Parse error line ${cur().line}: expected ${type}, got ${cur().type} '${cur().value}'`);
    return tokens[pos++];
  }
  function tryEat(type) { if (at(type)) return tokens[pos++]; return null; }
  function tryEatVal(type,val) { if (atVal(type,val)) return tokens[pos++]; return null; }
  function peekType(offset) { return tokens[pos+(offset||0)].type; }
  function peekVal(offset) { return tokens[pos+(offset||0)].value; }

  // Check if current position looks like a type name (for variable declarations)
  function isTypeName() {
    if (!at(T.IDENT)) return false;
    const v = cur().value;
    if (TYPE_NAMES.has(v)) return true;
    return false;
  }

  // Skip over array bracket suffixes: [] or [][] etc. Returns offset after brackets.
  function skipArrayBrackets(start) {
    let off = start;
    while (peekType(off) === T.LBRACKET && peekType(off+1) === T.RBRACKET) off += 2;
    return off;
  }

  // Check for declaration: type name = ... or type name ; or type name ,
  // Also handles type[][] name and type name[]
  function isDeclaration() {
    if (!isTypeName()) return false;
    const off = skipArrayBrackets(1);
    if (peekType(off) === T.IDENT) return true;
    return false;
  }

  // Check for function declaration: type name(...)
  function isFuncDecl() {
    if (!isTypeName()) return false;
    const off = skipArrayBrackets(1);
    if (peekType(off) === T.IDENT && peekType(off+1) === T.LPAREN) return true;
    return false;
  }

  function parseProgram() {
    const stmts = [];
    while (!at(T.EOF)) {
      // Skip [asy] and [/asy] markers
      if (at(T.LBRACKET) && peekType(1) === T.IDENT) {
        const v = peekVal(1);
        if (v === 'asy' || v === '/asy') {
          // skip tokens until after ]
          while (!at(T.RBRACKET) && !at(T.EOF)) pos++;
          if (at(T.RBRACKET)) pos++;
          // Also handle [/asy] which lexes as [ / ident ]
          continue;
        }
      }
      // Handle [/asy] where / is separate token
      if (at(T.LBRACKET) && peekType(1) === T.SLASH) {
        pos++; pos++; // skip [ /
        if (at(T.IDENT) && cur().value === 'asy') pos++;
        if (at(T.RBRACKET)) pos++;
        continue;
      }
      const s = parseStatement();
      if (s) stmts.push(s);
    }
    return {type:'Program', stmts};
  }

  function parseStatement() {
    // Empty statement
    if (tryEat(T.SEMI)) return null;

    // Import
    if (atVal(T.IDENT,'import') || atVal(T.IDENT,'access') || atVal(T.IDENT,'from') || atVal(T.IDENT,'include')) {
      return parseImport();
    }

    // Block
    if (at(T.LBRACE)) return parseBlock();

    // If
    if (atVal(T.IDENT,'if')) return parseIf();

    // For
    if (atVal(T.IDENT,'for')) return parseFor();

    // While
    if (atVal(T.IDENT,'while')) return parseWhile();

    // Do-while
    if (atVal(T.IDENT,'do')) return parseDoWhile();

    // Return
    if (atVal(T.IDENT,'return')) {
      const ln = cur().line; pos++;
      let val = null;
      if (!at(T.SEMI) && !at(T.EOF)) val = parseExpr();
      tryEat(T.SEMI);
      return ReturnStmt(val, ln);
    }

    // Break/Continue
    if (atVal(T.IDENT,'break')) { const ln=cur().line; pos++; tryEat(T.SEMI); return BreakStmt(ln); }
    if (atVal(T.IDENT,'continue')) { const ln=cur().line; pos++; tryEat(T.SEMI); return ContinueStmt(ln); }

    // Skip 'static' modifier
    if (atVal(T.IDENT,'static')) pos++;

    // Function declaration: type name(...) {...}
    if (isFuncDecl()) {
      // But only if next-next-next has a brace (body) - otherwise it could be a call
      const saved = pos;
      let retType = eat(T.IDENT).value;
      // Handle type[], type[][], etc.
      while (at(T.LBRACKET) && peekType(1) === T.RBRACKET) { pos += 2; retType += '[]'; }
      const name = eat(T.IDENT).value;
      if (at(T.LPAREN)) {
        // Peek ahead: parse params, check for body
        const paramStart = pos;
        eat(T.LPAREN);
        let depth = 1;
        while (depth > 0 && !at(T.EOF)) {
          if (at(T.LPAREN)) depth++;
          if (at(T.RPAREN)) depth--;
          if (depth > 0) pos++;
        }
        if (at(T.RPAREN)) pos++;
        if (at(T.LBRACE)) {
          // It is a function declaration
          pos = paramStart;
          return parseFuncDeclBody(retType, name, cur().line);
        }
      }
      pos = saved; // not a func decl, reparse as expression/decl
    }

    // Variable declaration: type name = ...; or type name;
    if (isDeclaration()) {
      return parseVarDecl();
    }

    // Expression statement (or assignment)
    return parseExprOrAssign();
  }

  function parseImport() {
    const ln = cur().line;
    const keyword = eat(T.IDENT).value; // import/access/from/include
    let mod = '';
    // Collect until semicolon
    while (!at(T.SEMI) && !at(T.EOF)) { mod += cur().value + ' '; pos++; }
    tryEat(T.SEMI);
    return ImportStmt(mod.trim(), ln);
  }

  function parseBlock() {
    const ln = cur().line;
    eat(T.LBRACE);
    const stmts = [];
    while (!at(T.RBRACE) && !at(T.EOF)) {
      const s = parseStatement();
      if (s) stmts.push(s);
    }
    eat(T.RBRACE);
    return Block(stmts, ln);
  }

  function parseIf() {
    const ln = cur().line;
    eat(T.IDENT); // 'if'
    eat(T.LPAREN);
    const cond = parseExpr();
    eat(T.RPAREN);
    const then_ = parseStatement();
    let else_ = null;
    if (atVal(T.IDENT,'else')) { pos++; else_ = parseStatement(); }
    return IfStmt(cond, then_, else_, ln);
  }

  function parseFor() {
    const ln = cur().line;
    eat(T.IDENT); // 'for'
    eat(T.LPAREN);

    // Check for foreach syntax: for (type var : expr)
    if (isTypeName() && peekType(1) === T.IDENT && peekType(2) === T.COLON) {
      const elemType = eat(T.IDENT).value;
      const elemName = eat(T.IDENT).value;
      eat(T.COLON); // ':'
      const iterExpr = parseExpr();
      eat(T.RPAREN);
      const body = parseStatement();
      return {type:'ForEachStmt', elemType, elemName, iter: iterExpr, body, line: ln};
    }
    // Also handle: for (var : expr) without explicit type
    if (at(T.IDENT) && peekType(1) === T.COLON) {
      const elemName = eat(T.IDENT).value;
      eat(T.COLON);
      const iterExpr = parseExpr();
      eat(T.RPAREN);
      const body = parseStatement();
      return {type:'ForEachStmt', elemType: 'var', elemName, iter: iterExpr, body, line: ln};
    }

    let init = null;
    if (!at(T.SEMI)) {
      if (isDeclaration()) init = parseVarDecl(true);
      else init = parseExprOrAssign(true);
    }
    tryEat(T.SEMI);
    let cond = null;
    if (!at(T.SEMI)) cond = parseExpr();
    eat(T.SEMI);
    let update = null;
    if (!at(T.RPAREN)) update = parseExprOrAssign(true);
    eat(T.RPAREN);
    const body = parseStatement();
    return ForStmt(init, cond, update, body, ln);
  }

  function parseWhile() {
    const ln = cur().line;
    eat(T.IDENT); // 'while'
    eat(T.LPAREN);
    const cond = parseExpr();
    eat(T.RPAREN);
    const body = parseStatement();
    return WhileStmt(cond, body, ln);
  }

  function parseDoWhile() {
    const ln = cur().line;
    eat(T.IDENT); // 'do'
    const body = parseStatement();
    eat(T.IDENT); // 'while'
    eat(T.LPAREN);
    const cond = parseExpr();
    eat(T.RPAREN);
    tryEat(T.SEMI);
    return DoWhileStmt(body, cond, ln);
  }

  function parseVarDecl(noSemi) {
    const ln = cur().line;
    let varType = eat(T.IDENT).value;
    // Handle type[], type[][], etc.
    while (at(T.LBRACKET) && peekType(1) === T.RBRACKET) { pos += 2; varType += '[]'; }
    const stmts = [];
    do {
      const name = eat(T.IDENT).value;
      // Handle array-after-name: pair name[], int name[][]
      let nameType = varType;
      while (at(T.LBRACKET) && peekType(1) === T.RBRACKET) { pos += 2; nameType += '[]'; }
      let init = null;
      if (tryEat(T.ASSIGN)) init = parseExpr();
      stmts.push(VarDecl(nameType, name, init, ln));
    } while (tryEat(T.COMMA));
    if (!noSemi) tryEat(T.SEMI);
    return stmts.length === 1 ? stmts[0] : {type:'MultiDecl', stmts, line:ln};
  }

  function parseFuncDeclBody(retType, name, ln) {
    eat(T.LPAREN);
    const params = [];
    while (!at(T.RPAREN) && !at(T.EOF)) {
      let pType = 'real';
      if (isTypeName()) {
        pType = eat(T.IDENT).value;
        // Handle type[], type[][], etc.
        while (at(T.LBRACKET) && peekType(1) === T.RBRACKET) { pos += 2; pType += '[]'; }
      }
      // Function-type parameter: void checker(int,int) or pair f(real)
      if (at(T.IDENT) && peekType(1) === T.LPAREN) {
        const pName = eat(T.IDENT).value;
        // Skip the function signature (params inside parens)
        eat(T.LPAREN);
        let depth = 1;
        while (depth > 0 && !at(T.EOF)) {
          if (at(T.LPAREN)) depth++;
          if (at(T.RPAREN)) depth--;
          if (depth > 0) pos++;
        }
        eat(T.RPAREN);
        let pDefault = null;
        if (tryEat(T.ASSIGN)) pDefault = parseExpr();
        params.push({type: pType, name: pName, default: pDefault});
      } else {
        const pName = eat(T.IDENT).value;
        // Handle array-after-name: pair vertices[], int arr[][]
        while (at(T.LBRACKET) && peekType(1) === T.RBRACKET) { pos += 2; pType += '[]'; }
        let pDefault = null;
        if (tryEat(T.ASSIGN)) pDefault = parseExpr();
        params.push({type: pType, name: pName, default: pDefault});
      }
      if (!tryEat(T.COMMA)) break;
    }
    eat(T.RPAREN);
    const body = parseBlock();
    return FuncDecl(retType, name, params, body, ln);
  }

  // Detect [/asy] end marker so we can tolerate missing semicolons
  function atEndMarker() {
    if (at(T.LBRACKET)) {
      if (peekType(1) === T.SLASH && peekType(2) === T.IDENT && peekVal(2) === 'asy') return true;
      if (peekType(1) === T.IDENT && peekVal(1) === '/asy') return true;
    }
    return false;
  }

  function parseExprOrAssign(noSemi) {
    const ln = cur().line;
    const expr = parseExpr();
    // Check for assignment operators
    if (at(T.ASSIGN)||at(T.PLUSASSIGN)||at(T.MINUSASSIGN)||at(T.STARASSIGN)||at(T.SLASHASSIGN)) {
      const op = eat(cur().type).value;
      const val = parseExpr();
      if (!noSemi) tryEat(T.SEMI);
      return Assignment(expr, op, val, ln);
    }
    if (!noSemi) { if (!atEndMarker()) tryEat(T.SEMI); }
    return ExprStmt(expr, ln);
  }

  // Pratt parser for expressions
  function parseExpr(minPrec) {
    if (minPrec === undefined) minPrec = 0;
    let left = parsePrefix();
    while (true) {
      const prec = infixPrec();
      if (prec <= minPrec) break;
      left = parseInfix(left, prec);
    }
    return left;
  }

  function infixPrec() {
    const t = cur();
    switch (t.type) {
      case T.OR: return 2;
      case T.AND: return 3;
      case T.EQ: case T.NEQ: return 4;
      case T.LT: case T.GT: case T.LE: case T.GE: return 5;
      case T.PLUS: case T.MINUS: return 6;
      case T.DASHDASH: case T.DOTDOT: case T.DOTDOTDOT: case T.HATHAT: return 5.5; // path join: lower than +/- so a--a+b means a--(a+b)
      case T.LBRACE: {
        // {dir} after a point starts a path direction — give it path-join precedence
        // so (0,0){1,0}..{1,0}(1,1) works inside function call args
        // Also handle named directions: {up}, {down}, {left}, {right}, etc.
        if (pos + 2 < tokens.length && tokens[pos+1].type === T.IDENT
            && NAMED_DIRS && NAMED_DIRS[tokens[pos+1].value]
            && tokens[pos+2].type === T.RBRACE) return 5.5;
        // Quick lookahead: scan to matching }, counting commas at depth 0
        let d = 0, commas = 0, closePos = -1;
        for (let i = pos + 1; i < tokens.length; i++) {
          if (tokens[i].type === T.LBRACE || tokens[i].type === T.LPAREN) d++;
          else if (tokens[i].type === T.RPAREN) d--;
          else if (tokens[i].type === T.RBRACE) { if (d === 0) { closePos = i; break; } d--; }
          else if (d === 0 && tokens[i].type === T.COMMA) commas++;
        }
        if (commas === 1) return 5.5; // {expr,expr} pair direction
        // Single expression direction: {dir(angle)} or {expr} followed by .. or --
        if (commas === 0 && closePos >= 0 && closePos + 1 < tokens.length) {
          const after = tokens[closePos + 1].type;
          if (after === T.DOTDOT || after === T.DOTDOTDOT || after === T.DASHDASH) return 5.5;
        }
        return 0;
      }
      case T.STAR: case T.SLASH: case T.PERCENT: case T.HASH: return 7;
      case T.CARET: return 9; // right-assoc
      case T.QUESTION: return 1; // ternary
      case T.DOT: return 11;
      case T.LPAREN: return 10; // function call
      case T.LBRACKET: {
        // Don't treat [/asy] or [asy] as array access
        if (peekType(1) === T.SLASH || (peekType(1) === T.IDENT && (peekVal(1) === 'asy' || peekVal(1) === '/asy'))) return 0;
        return 10; // array access
      }
      case T.PLUSPLUS: return 10; // postfix i++
      case T.MINUSMINUS_OP: return 10; // postfix i--
      default: return 0;
    }
  }

  function parseInfix(left, prec) {
    const t = cur();
    const ln = t.line;

    // Ternary
    if (t.type === T.QUESTION) {
      pos++;
      const then_ = parseExpr(0);
      eat(T.COLON);
      const else_ = parseExpr(0);
      return TernaryOp(left, then_, else_, ln);
    }

    // Member access
    if (t.type === T.DOT) {
      pos++;
      const member = eat(T.IDENT).value;
      return MemberAccess(left, member, ln);
    }

    // Function call
    if (t.type === T.LPAREN && left.type === 'Identifier') {
      return parseFuncCallNode(left, ln);
    }
    if (t.type === T.LPAREN && left.type === 'MemberAccess') {
      return parseFuncCallNode(left, ln);
    }

    // Array access
    if (t.type === T.LBRACKET) {
      pos++;
      const idx = parseExpr();
      eat(T.RBRACKET);
      return ArrayAccess(left, idx, ln);
    }

    // Path joins (including {dir} which starts a path direction)
    if (t.type === T.DASHDASH || t.type === T.DOTDOT || t.type === T.DOTDOTDOT || t.type === T.HATHAT || t.type === T.LBRACE) {
      return parsePathExpr(left);
    }

    // Postfix increment/decrement: i++ → (i += 1) but returns old value
    if (t.type === T.PLUSPLUS) {
      pos++;
      return Assignment(left, '+=', NumberLit(1, ln), ln);
    }
    if (t.type === T.MINUSMINUS_OP) {
      pos++;
      return Assignment(left, '-=', NumberLit(1, ln), ln);
    }

    // Binary operators (right-assoc for ^)
    pos++;
    const rightPrec = t.type === T.CARET ? prec - 1 : prec;
    const right = parseExpr(rightPrec);
    return BinaryOp(t.type, left, right, ln);
  }

  function parseFuncCallNode(callee, ln) {
    eat(T.LPAREN);
    const args = [];
    while (!at(T.RPAREN) && !at(T.EOF)) {
      // Support named parameters: name=value
      if (at(T.IDENT) && pos+1 < tokens.length && tokens[pos+1].type === T.ASSIGN) {
        const argName = cur().value;
        const argLn = cur().line;
        pos += 2; // skip identifier and '='
        args.push(NamedArg(argName, parseExpr(), argLn));
      } else {
        args.push(parseExpr());
      }
      if (!tryEat(T.COMMA)) break;
    }
    eat(T.RPAREN);
    return FuncCall(callee, args, ln);
  }

  // Named direction keywords for {up}, {down}, {left}, {right}
  const NAMED_DIRS = {up:{x:0,y:1}, down:{x:0,y:-1}, left:{x:-1,y:0}, right:{x:1,y:0},
    N:{x:0,y:1}, S:{x:0,y:-1}, E:{x:1,y:0}, W:{x:-1,y:0},
    NE:{x:1,y:1}, NW:{x:-1,y:1}, SE:{x:1,y:-1}, SW:{x:-1,y:-1}};

  // Try to parse a {dir} specifier. Returns direction object or null, restoring pos on failure.
  function tryParseDir() {
    if (!at(T.LBRACE)) return null;
    const saved = pos;
    pos++; // skip {
    // Check for named direction: {up}, {down}, etc.
    if (at(T.IDENT) && NAMED_DIRS[cur().value] && peekType(1) === T.RBRACE) {
      const d = NAMED_DIRS[cur().value];
      pos++; eat(T.RBRACE);
      return {x: NumberLit(d.x, saved), y: NumberLit(d.y, saved)};
    }
    try {
      const dx = parseExpr();
      if (at(T.COMMA)) {
        eat(T.COMMA);
        const dy = parseExpr();
        eat(T.RBRACE);
        return {x: dx, y: dy};
      } else if (at(T.RBRACE)) {
        // Single expression direction: {dir(225)} or {expr}
        eat(T.RBRACE);
        return {x: dx, y: null, singleExpr: true};
      } else { pos = saved; return null; }
    } catch(e) { pos = saved; return null; }
  }

  function parsePathExpr(first) {
    const ln = first.line;
    const nodes = [{point: first, join: null, dirOut: null}];

    // Check for outgoing direction on first node: point{dir}
    const d0 = tryParseDir();
    if (d0) nodes[0].dirOut = d0;

    while (at(T.DASHDASH) || at(T.DOTDOT) || at(T.DOTDOTDOT) || at(T.HATHAT)) {
      // Handle ^^ (path concatenation)
      if (at(T.HATHAT)) {
        pos++;
        const nextPoint = parseExpr(5.5);
        nodes[nodes.length-1].join = '^^';
        nodes.push({point: nextPoint, join: null, dirOut: null});
        const dOut = tryParseDir();
        if (dOut) nodes[nodes.length-1].dirOut = dOut;
        continue;
      }

      const joinTok = eat(cur().type);
      const join = joinTok.value === '--' ? '--' : '..';

      // Check for 'cycle'
      if (atVal(T.IDENT, 'cycle')) {
        pos++;
        nodes[nodes.length-1].join = join;
        nodes.push({point: Identifier('cycle', cur().line), join: null, isCycle: true});
        break;
      }

      // Check for tension
      let tension = null;
      if (atVal(T.IDENT, 'tension')) {
        pos++;
        const tin = parseExpr(7);
        let tout = tin;
        if (atVal(T.IDENT, 'and')) { pos++; tout = parseExpr(7); }
        tension = {in: tin, out: tout};
        eat(T.DOTDOT);
      }

      // Check for incoming direction {dir}
      const dirIn = tryParseDir();

      const point = parseExpr(5.5); // parse at path-join level so +/- bind tighter than --/..
      nodes[nodes.length-1].join = join;
      nodes[nodes.length-1].tension = tension;
      const newNode = {point, join: null, dirIn: dirIn};

      // Check for outgoing direction on this new node
      const dOutN = tryParseDir();
      if (dOutN) newNode.dirOut = dOutN;

      nodes.push(newNode);
    }
    return PathExpr(nodes, ln);
  }

  function parsePrefix() {
    const t = cur();
    const ln = t.line;

    // Unary minus/plus/not
    if (t.type === T.MINUS) { pos++; return UnaryOp('-', parseExpr(8), ln); }
    if (t.type === T.PLUS) { pos++; return parseExpr(8); }
    if (t.type === T.NOT) { pos++; return UnaryOp('!', parseExpr(8), ln); }

    // Prefix increment/decrement: ++i → (i += 1)
    if (t.type === T.PLUSPLUS) {
      pos++;
      const operand = parseExpr(8);
      return Assignment(operand, '+=', NumberLit(1, ln), ln);
    }
    if (t.type === T.MINUSMINUS_OP || t.type === T.DASHDASH) {
      // -- as prefix decrement (--i)
      pos++;
      const operand = parseExpr(8);
      return Assignment(operand, '-=', NumberLit(1, ln), ln);
    }

    // Number, possibly followed by identifier for implicit multiplication (e.g., 2pi, 3n, 1cm)
    if (t.type === T.NUMBER) {
      pos++;
      const numNode = NumberLit(t.value, ln);
      // Implicit multiplication: 2pi, 3n, 1cm, etc.
      if (at(T.IDENT)) {
        const nextVal = cur().value;
        // Not a keyword that starts a statement or type declaration
        const noImplicit = new Set(['if','else','for','while','do','return','break','continue','new','import','access','include','void']);
        if (!noImplicit.has(nextVal) && !isDeclaration()) {
          // Don't consume the ident - just emit a multiply and let normal parsing handle it
          return BinaryOp(T.STAR, numNode, parseExpr(7), ln);
        }
      }
      // Implicit multiplication: 10(expr), e.g. A+10(B-A) means A+10*(B-A)
      if (at(T.LPAREN)) {
        return BinaryOp(T.STAR, numNode, parseExpr(7), ln);
      }
      return numNode;
    }

    // String
    if (t.type === T.STRING) { pos++; return StringLit(t.value, ln); }

    // Bool
    if (t.type === T.BOOL) { pos++; return BoolLit(t.value, ln); }

    // null
    if (t.type === T.IDENT && t.value === 'null') { pos++; return NullLit(ln); }

    // operator keyword: operator .. or operator --
    if (t.type === T.IDENT && t.value === 'operator') {
      pos++;
      let opVal = '';
      if (at(T.DOTDOT) || at(T.DOTDOTDOT)) { opVal = cur().value; pos++; }
      else if (at(T.DASHDASH)) { opVal = '--'; pos++; }
      else if (at(T.PLUS)) { opVal = '+'; pos++; }
      else if (at(T.MINUS)) { opVal = '-'; pos++; }
      else if (at(T.STAR)) { opVal = '*'; pos++; }
      else if (at(T.CARET)) { opVal = '^'; pos++; }
      else { opVal = cur().value; pos++; }
      return {type:'OperatorLit', value: opVal, line: ln};
    }

    // new — anonymous function or array allocation
    if (t.type === T.IDENT && t.value === 'new') {
      pos++;
      const aType = at(T.IDENT) ? eat(T.IDENT).value : 'real';
      // new picture — creates a fresh picture object
      if (aType === 'picture' && !at(T.LPAREN) && !at(T.LBRACKET) && !at(T.LBRACE)) {
        return {type:'NewPicture', line: ln};
      }
      // Anonymous function: new type(params){ body }
      if (at(T.LPAREN)) {
        const saved = pos;
        // Peek: is this new type(params){ body } ?
        eat(T.LPAREN);
        let depth = 1, canBeFunc = false;
        while (depth > 0 && !at(T.EOF)) {
          if (at(T.LPAREN)) depth++;
          if (at(T.RPAREN)) depth--;
          if (depth > 0) pos++;
        }
        if (at(T.RPAREN)) pos++;
        canBeFunc = at(T.LBRACE);
        pos = saved;
        if (canBeFunc) {
          // Parse as anonymous function declaration
          return parseFuncDeclBody(aType, '', ln);
        }
      }
      // new type[expr] or new type[expr][expr] — sized array allocation
      if (at(T.LBRACKET)) {
        const dims = [];
        while (at(T.LBRACKET)) {
          pos++; // skip [
          if (at(T.RBRACKET)) { pos++; dims.push(null); } // new type[]
          else { dims.push(parseExpr()); eat(T.RBRACKET); }
        }
        // If we have sized dims, return an allocation node
        if (dims.some(d => d !== null)) {
          return {type:'NewArray', elemType: aType, dims, line: ln};
        }
      }
      // Might have initializer
      if (at(T.LBRACE)) {
        eat(T.LBRACE);
        const els = [];
        while (!at(T.RBRACE) && !at(T.EOF)) {
          els.push(parseExpr());
          if (!tryEat(T.COMMA)) break;
        }
        eat(T.RBRACE);
        return ArrayExpr(els, ln);
      }
      return ArrayExpr([], ln);
    }

    // Cast: (type) expr -- only for type names
    if (t.type === T.LPAREN && peekType(1) === T.IDENT && TYPE_NAMES.has(peekVal(1)) && peekType(2) === T.RPAREN) {
      pos++; const ctype = eat(T.IDENT).value; eat(T.RPAREN);
      return CastExpr(ctype, parseExpr(8), ln);
    }

    // Parenthesized expr or pair/triple literal
    if (t.type === T.LPAREN) {
      pos++;
      const first = parseExpr();
      if (at(T.COMMA)) {
        eat(T.COMMA);
        const second = parseExpr();
        if (at(T.COMMA)) {
          // Triple literal (x, y, z)
          eat(T.COMMA);
          const third = parseExpr();
          eat(T.RPAREN);
          return TripleLit(first, second, third, ln);
        }
        eat(T.RPAREN);
        return PairLit(first, second, ln);
      }
      eat(T.RPAREN);
      return first; // grouped expression
    }

    // Array literal {a, b, c}
    if (t.type === T.LBRACE) {
      pos++;
      const els = [];
      while (!at(T.RBRACE) && !at(T.EOF)) {
        els.push(parseExpr());
        if (!tryEat(T.COMMA)) break;
      }
      eat(T.RBRACE);
      return ArrayExpr(els, ln);
    }

    // Identifier
    if (t.type === T.IDENT) {
      pos++;
      return Identifier(t.value, ln);
    }

    // Fallback: skip
    pos++;
    return NullLit(ln);
  }

  return parseProgram();
}

// ============================================================
// Runtime Value Helpers
// ============================================================

function makePair(x,y) { return {_tag:'pair', x:x||0, y:y||0}; }
function makeTriple(x,y,z) { return {_tag:'triple', x:x||0, y:y||0, z:z||0}; }
function makePen(props) {
  return Object.assign({_tag:'pen', r:0, g:0, b:0, linewidth:0.5, linestyle:null,
    fontsize:12, opacity:1, linecap:null, linejoin:null, fillrule:null, _lwExplicit:false}, props);
}
function makeTransform(a,b,c,d,e,f) { return {_tag:'transform',a,b,c,d,e,f}; }
function makePath(segs, closed) { return {_tag:'path', segs: segs||[], closed:!!closed}; }
// seg = {p0:{x,y}, cp1:{x,y}, cp2:{x,y}, p3:{x,y}}
function makeSeg(p0,cp1,cp2,p3) { return {p0,cp1,cp2,p3}; }
function lineSegment(a,b) { return makeSeg(a, {x:a.x+(b.x-a.x)/3,y:a.y+(b.y-a.y)/3}, {x:a.x+2*(b.x-a.x)/3,y:a.y+2*(b.y-a.y)/3}, b); }

function isPair(v) { return v && v._tag === 'pair'; }
function isTriple(v) { return v && v._tag === 'triple'; }
function isPen(v) { return v && v._tag === 'pen'; }
function isPath(v) { return v && v._tag === 'path'; }
function isTransform(v) { return v && v._tag === 'transform'; }
function isString(v) { return typeof v === 'string'; }
function isBool(v) { return typeof v === 'boolean'; }
function isNumber(v) { return typeof v === 'number'; }
function isArray(v) { return Array.isArray(v); }
function isCallable(v) { return typeof v === 'function' || (v && v._tag === 'func'); }

function penToCSS(pen) {
  if (!pen || !isPen(pen)) return {stroke:'#000000',strokeWidth:0.5,opacity:1};
  const hex = '#' + [pen.r,pen.g,pen.b].map(c => {
    const h = Math.round(Math.max(0,Math.min(255,c*255))).toString(16);
    return h.length<2?'0'+h:h;
  }).join('');
  return {stroke:hex, strokeWidth:pen.linewidth, opacity:pen.opacity, fill:hex};
}

function clonePen(p) { return Object.assign({}, p); }

function mergePens(a,b) {
  if (!isPen(a)) return b;
  if (!isPen(b)) return a;
  const r = clonePen(a);
  // Color: In Asymptote, pen + pen adds RGB values (clamped to 0-1).
  // But for modifier pens (linewidth/fontsize only), don't change color.
  const bHasColor = (b.r !== 0 || b.g !== 0 || b.b !== 0);
  const bIsModifier = !bHasColor && (b.linewidth !== 0.5 || b.linestyle || b.fontsize !== 12 || b.linecap || b.linejoin);
  if (bHasColor) {
    const aHasColor = (a.r !== 0 || a.g !== 0 || a.b !== 0);
    if (aHasColor) {
      // Both have color: add RGB (Asymptote pen addition semantics)
      r.r = Math.min(1, a.r + b.r);
      r.g = Math.min(1, a.g + b.g);
      r.b = Math.min(1, a.b + b.b);
    } else {
      r.r = b.r; r.g = b.g; r.b = b.b;
    }
  }
  if (b.linewidth !== 0.5) r.linewidth = b.linewidth;
  if (b._lwExplicit) r._lwExplicit = true;
  if (b.linestyle) r.linestyle = b.linestyle;
  if (b.fontsize !== 12) r.fontsize = b.fontsize;
  if (b.opacity !== 1) r.opacity = b.opacity;
  if (b.linecap) r.linecap = b.linecap;
  if (b.linejoin) r.linejoin = b.linejoin;
  return r;
}

function applyTransformPair(t, p) {
  return makePair(t.a + t.b*p.x + t.c*p.y, t.d + t.e*p.x + t.f*p.y);
}

function applyTransformPath(t, path) {
  const newSegs = path.segs.map(s => makeSeg(
    applyTransformPair(t, s.p0), applyTransformPair(t, s.cp1),
    applyTransformPair(t, s.cp2), applyTransformPair(t, s.p3)
  ));
  return makePath(newSegs, path.closed);
}

function composeTransforms(t1, t2) {
  // t1 applied first, then t2: result = t2(t1(x))
  // [a2+b2*b1+c2*e1, b2*b1_... ] — standard affine composition
  // T = [b c; e f] translation [a; d]
  // For pair (x,y): T(x,y) = (a + bx + cy, d + ex + fy)
  return makeTransform(
    t2.a + t2.b*t1.a + t2.c*t1.d,
    t2.b*t1.b + t2.c*t1.e,
    t2.b*t1.c + t2.c*t1.f,
    t2.d + t2.e*t1.a + t2.f*t1.d,
    t2.e*t1.b + t2.f*t1.e,
    t2.e*t1.c + t2.f*t1.f
  );
}

// ============================================================
// Hobby's Algorithm for smooth '..' paths
// ============================================================

function hobbySpline(knots, closed) {
  const n = knots.length;
  if (n < 2) return [];
  if (n === 2) {
    // Simple case: single segment with default smooth tangents
    return [hobbyTwoPointSegment(knots[0], knots[1])];
  }

  // Compute chord distances and turning angles
  const m = closed ? n : n - 1;
  const d = []; // chord lengths
  const delta = []; // chord angles
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n;
    const dx = knots[j].x - knots[i].x;
    const dy = knots[j].y - knots[i].y;
    d.push(Math.sqrt(dx*dx + dy*dy));
    delta.push(Math.atan2(dy, dx));
  }

  // Turning angles psi
  const psi = new Array(n).fill(0);
  for (let i = 1; i < (closed ? n : n-1); i++) {
    const prev = (i - 1 + m) % m;
    psi[i] = delta[i % m] - delta[prev];
    // Normalize to [-pi, pi]
    while (psi[i] > Math.PI) psi[i] -= 2*Math.PI;
    while (psi[i] < -Math.PI) psi[i] += 2*Math.PI;
  }
  if (closed) {
    psi[0] = delta[0] - delta[m-1];
    while (psi[0] > Math.PI) psi[0] -= 2*Math.PI;
    while (psi[0] < -Math.PI) psi[0] += 2*Math.PI;
  }

  // Solve for theta (tangent angle offsets at each knot)
  const theta = new Array(n).fill(0);
  const phi = new Array(n).fill(0);

  if (closed) {
    // Cyclic tridiagonal system
    solveCyclicTridiag(n, d, psi, theta);
  } else {
    // Open: natural end conditions (theta[0]=0 approx, theta[n-1]=0)
    solveOpenTridiag(n, d, psi, theta);
  }

  // Compute phi from theta and psi
  for (let i = 0; i < m; i++) {
    const j = (i+1) % n;
    phi[i] = -psi[j] - theta[j];
  }

  // Generate Bezier control points
  const segs = [];
  for (let i = 0; i < m; i++) {
    const j = (i+1) % n;
    const alpha = hobbyRho(theta[i], phi[i]) * d[i] / 3;
    const beta = hobbyRho(phi[i], theta[i]) * d[i] / 3;

    const angle_out = delta[i] + theta[i];
    const angle_in = delta[i] - phi[i] + Math.PI;

    const cp1 = {
      x: knots[i].x + alpha * Math.cos(angle_out),
      y: knots[i].y + alpha * Math.sin(angle_out)
    };
    const cp2 = {
      x: knots[j].x + beta * Math.cos(angle_in),
      y: knots[j].y + beta * Math.sin(angle_in)
    };
    segs.push(makeSeg(knots[i], cp1, cp2, knots[j]));
  }
  return segs;
}

// Hobby's velocity function rho(theta, phi)
function hobbyRho(theta, phi) {
  const st = Math.sin(theta), ct = Math.cos(theta);
  const sp = Math.sin(phi), cp = Math.cos(phi);
  const num = 2 + Math.SQRT2 * (st - sp/16) * (sp - st/16) * (ct - cp);
  const den = (1 + 0.5*(Math.SQRT2-1)*ct) * (1 + 0.5*(Math.SQRT2-1)*cp);
  return Math.max(0.1, num / den);
}

function hobbyTwoPointSegment(a, b) {
  // Default smooth tangents for two-point spline
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.sqrt(dx*dx + dy*dy);
  const alpha = d / 3;
  const angle = Math.atan2(dy, dx);
  return makeSeg(a,
    {x: a.x + alpha*Math.cos(angle), y: a.y + alpha*Math.sin(angle)},
    {x: b.x - alpha*Math.cos(angle), y: b.y - alpha*Math.sin(angle)},
    b
  );
}

function solveOpenTridiag(n, d, psi, theta) {
  if (n <= 2) { theta[0] = 0; if(n>1) theta[1] = 0; return; }
  const m = n - 1;
  // Build tridiagonal: A[i]*theta[i-1] + B[i]*theta[i] + C[i]*theta[i+1] = D[i]
  const A = new Array(n).fill(0), B = new Array(n).fill(0);
  const C = new Array(n).fill(0), D = new Array(n).fill(0);

  // Natural end conditions: theta[0] has a mock equation
  B[0] = 1; C[0] = 1; D[0] = -psi[1];
  for (let i = 1; i < m; i++) {
    const di_1 = d[i-1] || 1, di = d[i] || 1;
    A[i] = 1/di_1;
    B[i] = (2*di_1 + 2*di) / (di_1 * di);
    C[i] = 1/di;
    D[i] = -(2*psi[i]*di + psi[i]*di_1) / (di_1 * di);
  }
  B[m] = 1; A[m] = 1; D[m] = 0;

  // Thomas algorithm
  for (let i = 1; i < n; i++) {
    const w = A[i] / B[i-1];
    B[i] -= w * C[i-1];
    D[i] -= w * D[i-1];
  }
  theta[n-1] = D[n-1] / B[n-1];
  for (let i = n-2; i >= 0; i--) {
    theta[i] = (D[i] - C[i]*theta[i+1]) / B[i];
  }
}

function solveCyclicTridiag(n, d, psi, theta) {
  // Use Sherman-Morrison trick for cyclic tridiagonal
  if (n < 3) { theta.fill(0); return; }
  const A = new Array(n).fill(0), B = new Array(n).fill(0);
  const C = new Array(n).fill(0), D = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const di = d[i] || 1;
    const di_1 = d[(i-1+n)%n] || 1;
    A[i] = 1/di_1;
    B[i] = (2*di_1 + 2*di) / (di_1 * di);
    C[i] = 1/di;
    D[i] = -(2*psi[i]*di + psi[(i+1)%n]*di_1) / (di_1 * di);
  }

  // Sherman-Morrison: modify first eq to break cycle
  const gamma = -B[0];
  B[0] -= gamma;
  B[n-1] -= A[0]*C[n-1]/gamma;

  // Solve two systems with Thomas
  const y = new Array(n).fill(0), q = new Array(n).fill(0);
  const u = new Array(n).fill(0);
  u[0] = gamma; u[n-1] = C[n-1];

  // Forward elimination for both
  const B2 = B.slice();
  const D2 = D.slice();
  const u2 = u.slice();
  for (let i = 1; i < n; i++) {
    const w = A[i] / B2[i-1];
    B2[i] -= w * C[i-1];
    D2[i] -= w * D2[i-1];
    u2[i] -= w * u2[i-1];
  }
  y[n-1] = D2[n-1] / B2[n-1];
  q[n-1] = u2[n-1] / B2[n-1];
  for (let i = n-2; i >= 0; i--) {
    y[i] = (D2[i] - C[i]*y[i+1]) / B2[i];
    q[i] = (u2[i] - C[i]*q[i+1]) / B2[i];
  }

  const factor = (y[0] + A[0]*y[n-1]/gamma) / (1 + q[0] + A[0]*q[n-1]/gamma);
  for (let i = 0; i < n; i++) theta[i] = y[i] - factor*q[i];
}

// ============================================================
// Interpreter / Evaluator
// ============================================================

const BREAK_SIG = {_sig:'break'};
const CONTINUE_SIG = {_sig:'continue'};
function ReturnSig(v) { return {_sig:'return', value:v}; }

function createInterpreter() {
  // Draw commands output
  const drawCommands = [];
  // Active picture (all drawing routes here; copied to drawCommands at end)
  let currentPic = {_tag:'picture', commands:[]};
  // 3D projection (set by import three / currentprojection = ...)
  let projection = null; // null = no 3D; {type, camera, target, up, ...}
  // Settings
  let unitScale = 1;       // unitsize value in points
  let hasUnitScale = false; // whether unitsize() was explicitly called
  let sizeW = 0, sizeH = 0;
  let defaultPen = makePen({});
  let iterationLimit = 100000;

  // Project a triple to a pair using the current 3D projection
  function projectTriple(v) {
    if (!isTriple(v)) return isPair(v) ? v : makePair(0,0);
    const proj = projection;
    if (!proj) return makePair(v.x, v.y); // no projection: drop z
    // Camera (eye) position
    const cx = proj.cx, cy = proj.cy, cz = proj.cz;
    // Target (look-at) position
    const tx = proj.tx || 0, ty = proj.ty || 0, tz = proj.tz || 0;
    // View direction
    const dx = cx-tx, dy = cy-ty, dz = cz-tz;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
    // Forward (into screen), right, up vectors
    const fw = {x:dx/dist, y:dy/dist, z:dz/dist};
    // Up hint
    const ux = proj.ux || 0, uy = proj.uy || 0, uz = proj.uz || 1;
    // Right = up x forward
    let rx = uy*fw.z - uz*fw.y, ry = uz*fw.x - ux*fw.z, rz = ux*fw.y - uy*fw.x;
    const rlen = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1;
    rx /= rlen; ry /= rlen; rz /= rlen;
    // True up = forward x right
    const upx = fw.y*rz - fw.z*ry, upy = fw.z*rx - fw.x*rz, upz = fw.x*ry - fw.y*rx;

    // Translate point relative to target
    const px = v.x - tx, py = v.y - ty, pz = v.z - tz;

    if (proj.type === 'perspective') {
      // Perspective projection
      const depth = px*fw.x + py*fw.y + pz*fw.z;
      const scale = dist / (dist - depth || 1);
      const sx = px*rx + py*ry + pz*rz;
      const sy = px*upx + py*upy + pz*upz;
      return makePair(sx * scale, sy * scale);
    }
    // Orthographic projection (default)
    const sx = px*rx + py*ry + pz*rz;
    const sy = px*upx + py*upy + pz*upz;
    return makePair(sx, sy);
  }

  // Transform a single draw command by an affine transform
  function transformDrawCmd(t, dc) {
    const r = Object.assign({}, dc);
    if (r.path) r.path = applyTransformPath(t, r.path);
    if (r.pos) r.pos = applyTransformPair(t, r.pos);
    // Preserve alignment direction (don't transform it)
    return r;
  }

  // Apply a transform to all commands in a picture, returning a new picture
  function transformPicture(t, pic) {
    return {_tag:'picture', commands: pic.commands.map(c => transformDrawCmd(t, c))};
  }

  // Environment (scoped)
  function createEnv(parent) {
    const vars = new Map();
    return {
      parent,
      get(name) {
        if (vars.has(name)) return vars.get(name);
        if (parent) return parent.get(name);
        return undefined;
      },
      set(name, val) { vars.set(name, val); },
      has(name) { return vars.has(name) || (parent && parent.has(name)); },
      update(name, val) {
        if (vars.has(name)) { vars.set(name, val); return true; }
        if (parent && parent.update(name, val)) return true;
        vars.set(name, val); return true;
      },
    };
  }

  const globalEnv = createEnv(null);
  installStdlib(globalEnv);

  function evalNode(node, env) {
    if (!node) return null;
    switch(node.type) {
      case 'Program': return evalProgram(node, env);
      case 'Block': return evalBlock(node, env);
      case 'MultiDecl': { for (const s of node.stmts) evalNode(s, env); return null; }
      case 'NumberLit': return node.value;
      case 'StringLit': return node.value;
      case 'BoolLit': return node.value;
      case 'NullLit': return null;
      case 'Identifier': return evalIdent(node, env);
      case 'PairLit': return makePair(toNumber(evalNode(node.x,env)), toNumber(evalNode(node.y,env)));
      case 'TripleLit': return makeTriple(toNumber(evalNode(node.x,env)), toNumber(evalNode(node.y,env)), toNumber(evalNode(node.z,env)));
      case 'ArrayExpr': return node.elements.map(e => evalNode(e,env));
      case 'NewPicture': return {_tag:'picture', commands:[]};
      case 'NewArray': {
        const dims = node.dims.map(d => d ? Math.floor(toNumber(evalNode(d, env))) : 0);
        function allocArray(depth) {
          const size = dims[depth] || 0;
          const arr = new Array(size);
          if (depth + 1 < dims.length) {
            for (let i = 0; i < size; i++) arr[i] = allocArray(depth + 1);
          } else {
            arr.fill(0);
          }
          return arr;
        }
        return allocArray(0);
      }
      case 'BinaryOp': return evalBinary(node, env);
      case 'UnaryOp': return evalUnary(node, env);
      case 'FuncCall': return evalFuncCall(node, env);
      case 'MemberAccess': return evalMemberAccess(node, env);
      case 'ArrayAccess': return evalArrayAccess(node, env);
      case 'TernaryOp': return toBool(evalNode(node.cond,env)) ? evalNode(node.then,env) : evalNode(node.else,env);
      case 'CastExpr': return evalCast(node, env);
      case 'NamedArg': return evalNode(node.value, env);
      case 'PathExpr': return evalPathExpr(node, env);
      case 'VarDecl': return evalVarDecl(node, env);
      case 'Assignment': return evalAssignment(node, env);
      case 'ExprStmt': return evalNode(node.expr, env);
      case 'IfStmt': return evalIf(node, env);
      case 'ForStmt': return evalFor(node, env);
      case 'ForEachStmt': return evalForEach(node, env);
      case 'WhileStmt': return evalWhile(node, env);
      case 'DoWhileStmt': return evalDoWhile(node, env);
      case 'ReturnStmt': throw ReturnSig(node.value ? evalNode(node.value,env) : null);
      case 'BreakStmt': throw BREAK_SIG;
      case 'ContinueStmt': throw CONTINUE_SIG;
      case 'FuncDecl': return evalFuncDecl(node, env);
      case 'ImportStmt': return evalImport(node, env);
      case 'OperatorLit': return {_tag:'operator', value: node.value};
      default: return null;
    }
  }

  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') return parseFloat(v) || 0;
    if (isPair(v)) return Math.sqrt(v.x*v.x + v.y*v.y);
    if (isTriple(v)) return Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
    return 0;
  }
  function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    if (v === null || v === undefined) return false;
    return true;
  }
  function toPair(v) {
    if (isPair(v)) return v;
    if (isTriple(v)) return projectTriple(v);
    if (typeof v === 'number') return makePair(v, 0);
    return makePair(0,0);
  }
  function toTriple(v) {
    if (isTriple(v)) return v;
    if (isPair(v)) return makeTriple(v.x, v.y, 0);
    if (typeof v === 'number') return makeTriple(v, 0, 0);
    return makeTriple(0,0,0);
  }

  function evalProgram(node, env) {
    let result = null;
    for (const s of node.stmts) {
      result = evalNode(s, env);
      if (result && result._sig) return result;
    }
    return result;
  }

  function evalBlock(node, env) {
    const local = createEnv(env);
    for (const s of node.stmts) {
      const r = evalNode(s, local);
      if (r && r._sig) return r;
    }
    return null;
  }

  function evalIdent(node, env) {
    const v = env.get(node.name);
    if (v === undefined) {
      // Might be a function name used as identifier
      return null;
    }
    return v;
  }

  function evalBinary(node, env) {
    const left = evalNode(node.left, env);
    const right = evalNode(node.right, env);
    const op = node.op;

    // Pen + pen composition
    if (op === T.PLUS && isPen(left) && isPen(right)) return mergePens(left, right);
    if (op === T.PLUS && isPen(left) && isNumber(right)) { const r = clonePen(left); r.linewidth = left.linewidth + right; r._lwExplicit = true; return r; }
    if (op === T.PLUS && isNumber(left) && isPen(right)) { const r = clonePen(right); r.linewidth = right.linewidth + left; r._lwExplicit = true; return r; }
    if (op === T.PLUS && isPen(left)) return mergePens(left, isPen(right) ? right : makePen({r:0,g:0,b:0}));
    if (op === T.PLUS && isPen(right)) return mergePens(isPen(left) ? left : makePen({r:0,g:0,b:0}), right);
    // number * pen = scale color (e.g. 0.9*white = light gray, .6white)
    if (op === T.STAR && isNumber(left) && isPen(right)) {
      return makePen(Object.assign({}, right, {r:left*right.r, g:left*right.g, b:left*right.b}));
    }
    if (op === T.STAR && isPen(left) && isNumber(right)) {
      return makePen(Object.assign({}, left, {r:right*left.r, g:right*left.g, b:right*left.b}));
    }

    // Triple ops
    if (isTriple(left) || isTriple(right)) {
      const l = isTriple(left) ? left : toTriple(left);
      const r = isTriple(right) ? right : toTriple(right);
      switch(op) {
        case T.PLUS: return makeTriple(l.x+r.x, l.y+r.y, l.z+r.z);
        case T.MINUS: return makeTriple(l.x-r.x, l.y-r.y, l.z-r.z);
        case T.EQ: return l.x===r.x && l.y===r.y && l.z===r.z;
        case T.NEQ: return l.x!==r.x || l.y!==r.y || l.z!==r.z;
      }
      // scalar * triple, triple * scalar, triple / scalar
      if (isNumber(left) && isTriple(right)) {
        if (op===T.STAR) return makeTriple(left*right.x, left*right.y, left*right.z);
      }
      if (isTriple(left) && isNumber(right)) {
        if (op===T.STAR) return makeTriple(left.x*right, left.y*right, left.z*right);
        if (op===T.SLASH) return right ? makeTriple(left.x/right, left.y/right, left.z/right) : makeTriple(0,0,0);
      }
    }
    // Pair ops
    if (isPair(left) && isPair(right)) {
      switch(op) {
        case T.PLUS: return makePair(left.x+right.x, left.y+right.y);
        case T.MINUS: return makePair(left.x-right.x, left.y-right.y);
        case T.STAR: return makePair(left.x*right.x - left.y*right.y, left.x*right.y + left.y*right.x); // complex multiply
        case T.SLASH: { const d=right.x*right.x+right.y*right.y; return d?makePair((left.x*right.x+left.y*right.y)/d,(left.y*right.x-left.x*right.y)/d):makePair(0,0); }
        case T.EQ: return left.x===right.x && left.y===right.y;
        case T.NEQ: return left.x!==right.x || left.y!==right.y;
        case T.CARET: {
          // Complex exponentiation: (a+bi)^n using polar form
          const r = Math.sqrt(left.x*left.x + left.y*left.y);
          const theta = Math.atan2(left.y, left.x);
          const n = right.x; // real part of exponent
          const rn = Math.pow(r, n);
          return makePair(rn * Math.cos(n * theta), rn * Math.sin(n * theta));
        }
      }
    }
    // pair ^ real (complex exponentiation)
    if (isPair(left) && isNumber(right)) {
      if (op===T.CARET) {
        const r = Math.sqrt(left.x*left.x + left.y*left.y);
        const theta = Math.atan2(left.y, left.x);
        const rn = Math.pow(r, right);
        return makePair(rn * Math.cos(right * theta), rn * Math.sin(right * theta));
      }
    }
    // real * pair, pair * real
    if (isNumber(left) && isPair(right)) {
      if (op===T.STAR) return makePair(left*right.x, left*right.y);
    }
    if (isPair(left) && isNumber(right)) {
      if (op===T.STAR) return makePair(left.x*right, left.y*right);
      if (op===T.SLASH) return right?makePair(left.x/right, left.y/right):makePair(0,0);
      if (op===T.PLUS) return makePair(left.x+right, left.y+right);
      if (op===T.MINUS) return makePair(left.x-right, left.y-right);
    }

    // Transform * pair
    if (isTransform(left) && isPair(right)) return applyTransformPair(left, right);
    // Transform * path
    if (isTransform(left) && isPath(right)) return applyTransformPath(left, right);
    // Transform * picture
    if (isTransform(left) && right && right._tag === 'picture') return transformPicture(left, right);
    // Transform * transform
    if (isTransform(left) && isTransform(right)) return composeTransforms(right, left);
    // Transform * string → Label with transform (e.g. scale(0.7)*"text", rotate(90)*"text")
    if (isTransform(left) && isString(right)) return {_tag:'label', text: right, transform: left};
    // Transform * label → label with composed transform
    if (isTransform(left) && right && right._tag === 'label') {
      const existing = right.transform;
      const t = existing ? composeTransforms(existing, left) : left;
      return Object.assign({}, right, {transform: t});
    }

    // String concatenation
    if (isString(left) || isString(right)) {
      if (op === T.PLUS) return String(isTriple(left)?tripleToStr(left):isPair(left)?pairToStr(left):left) + String(isTriple(right)?tripleToStr(right):isPair(right)?pairToStr(right):right);
    }

    // Number ops
    const l = toNumber(left), r = toNumber(right);
    switch(op) {
      case T.PLUS: return l+r;
      case T.MINUS: return l-r;
      case T.STAR: return l*r;
      case T.SLASH: return r!==0?l/r:0;
      case T.PERCENT: return r!==0?l%r:0;
      case T.HASH: return r!==0?Math.floor(l/r):0; // integer quotient
      case T.CARET: return Math.pow(l,r);
      case T.EQ: return l===r;
      case T.NEQ: return l!==r;
      case T.LT: return l<r;
      case T.GT: return l>r;
      case T.LE: return l<=r;
      case T.GE: return l>=r;
      case T.AND: return toBool(left) && toBool(right);
      case T.OR: return toBool(left) || toBool(right);
    }
    return 0;
  }

  function pairToStr(p) { return `(${p.x},${p.y})`; }
  function tripleToStr(t) { return `(${t.x},${t.y},${t.z})`; }

  // Evaluate binary op on raw values (for compound assignment)
  function evalBinaryValues(op, left, right) {
    if (op === T.PLUS && isPen(left) && isPen(right)) return mergePens(left, right);
    if (isPair(left) && isPair(right)) {
      if (op===T.PLUS) return makePair(left.x+right.x,left.y+right.y);
      if (op===T.MINUS) return makePair(left.x-right.x,left.y-right.y);
    }
    if (isNumber(left) && isPair(right) && op===T.STAR) return makePair(left*right.x,left*right.y);
    if (isPair(left) && isNumber(right)) {
      if (op===T.STAR) return makePair(left.x*right,left.y*right);
      if (op===T.SLASH) return right?makePair(left.x/right,left.y/right):makePair(0,0);
    }
    if (isString(left)||isString(right)) { if(op===T.PLUS) return String(left)+String(right); }
    const l=toNumber(left),r=toNumber(right);
    if (op===T.PLUS) return l+r;
    if (op===T.MINUS) return l-r;
    if (op===T.STAR) return l*r;
    if (op===T.SLASH) return r?l/r:0;
    return 0;
  }

  function evalUnary(node, env) {
    const v = evalNode(node.operand, env);
    if (node.op === '-') {
      if (isTriple(v)) return makeTriple(-v.x, -v.y, -v.z);
      if (isPair(v)) return makePair(-v.x, -v.y);
      return -toNumber(v);
    }
    if (node.op === '!') return !toBool(v);
    return v;
  }

  function evalFuncCall(node, env) {
    // Get the callee
    let callee;
    let calleeName = '';
    if (node.callee.type === 'Identifier') {
      calleeName = node.callee.name;
      callee = env.get(calleeName);
    } else if (node.callee.type === 'MemberAccess') {
      // e.g. path.length
      const obj = evalNode(node.callee.object, env);
      calleeName = node.callee.member;
      // Try method dispatch
      return evalMethodCall(obj, calleeName, node.args, env);
    } else {
      callee = evalNode(node.callee, env);
    }

    // Draw commands: evaluate args with line info
    const drawFuncs = new Set(['draw','fill','filldraw','clip','unfill','label','dot']);
    if (drawFuncs.has(calleeName)) {
      const args = node.args.map(a => evalNode(a, env));
      args._line = node._sourceLine || node.line || 0;
      if (calleeName === 'label') return evalLabel(args);
      if (calleeName === 'dot') {
        // dot(triple, triple) is dot product, not drawing
        if (args.length === 2 && isTriple(args[0]) && isTriple(args[1])) {
          return args[0].x*args[1].x + args[0].y*args[1].y + args[0].z*args[1].z;
        }
        if (args.length === 2 && isPair(args[0]) && isPair(args[1])) {
          return args[0].x*args[1].x + args[0].y*args[1].y;
        }
        return evalDot(args);
      }
      return evalDraw(calleeName, args);
    }

    if (typeof callee === 'function') {
      const args = node.args.map(a => {
        if (a.type === 'NamedArg') {
          const obj = {_named: true};
          obj[a.name] = evalNode(a.value, env);
          return obj;
        }
        return evalNode(a, env);
      });
      return callee(...args);
    }
    if (callee && callee._tag === 'func') {
      return callUserFunc(callee, node.args, env);
    }

    // gray(number) → grayscale pen  (gray is also a pen constant)
    if (calleeName === 'gray' && isPen(callee)) {
      const args = node.args.map(a => evalNode(a, env));
      if (args.length >= 1) {
        const v = toNumber(args[0]);
        return makePen({r:v,g:v,b:v});
      }
      return callee;
    }
    // Calling a pen as a function (e.g. invisible()) — just return the pen
    if (isPen(callee)) return callee;

    // Type constructor calls: pair(x,y), triple(x,y,z), real(x), int(x), etc.
    if (calleeName === 'pair' && node.args.length === 2) {
      return makePair(toNumber(evalNode(node.args[0],env)), toNumber(evalNode(node.args[1],env)));
    }
    if (calleeName === 'triple' && node.args.length === 3) {
      return makeTriple(toNumber(evalNode(node.args[0],env)), toNumber(evalNode(node.args[1],env)), toNumber(evalNode(node.args[2],env)));
    }

    // Unknown function - return null
    return null;
  }

  let _callDepth = 0;
  const MAX_CALL_DEPTH = 256;

  function callUserFunc(func, argNodes, callEnv) {
    if (++_callDepth > MAX_CALL_DEPTH) { _callDepth--; throw new Error('Maximum recursion depth exceeded'); }
    const local = createEnv(func.closure);
    const params = func.params;
    // Separate positional and named arguments
    const positional = [];
    const named = {};
    for (const a of argNodes) {
      if (a.type === 'NamedArg') {
        named[a.name] = a.value;
      } else {
        positional.push(a);
      }
    }
    let posIdx = 0;
    for (let i = 0; i < params.length; i++) {
      if (named[params[i].name] !== undefined) {
        local.set(params[i].name, evalNode(named[params[i].name], callEnv));
      } else if (posIdx < positional.length) {
        local.set(params[i].name, evalNode(positional[posIdx++], callEnv));
      } else if (params[i].default) {
        local.set(params[i].name, evalNode(params[i].default, local));
      } else {
        local.set(params[i].name, null);
      }
    }
    try {
      evalNode(func.body, local);
    } catch(e) {
      if (e && e._sig === 'return') { _callDepth--; return e.value; }
      _callDepth--; throw e;
    }
    _callDepth--;
    return null;
  }

  // Call a user-defined function with already-evaluated argument values
  function callUserFuncValues(func, argValues) {
    if (++_callDepth > MAX_CALL_DEPTH) { _callDepth--; throw new Error('Maximum recursion depth exceeded'); }
    const local = createEnv(func.closure);
    const params = func.params;
    for (let i = 0; i < params.length; i++) {
      if (i < argValues.length) {
        local.set(params[i].name, argValues[i]);
      } else if (params[i].default) {
        local.set(params[i].name, evalNode(params[i].default, local));
      } else {
        local.set(params[i].name, null);
      }
    }
    try {
      evalNode(func.body, local);
    } catch(e) {
      if (e && e._sig === 'return') { _callDepth--; return e.value; }
      _callDepth--; throw e;
    }
    _callDepth--;
    return null;
  }

  // Helper to invoke either a native JS function or user-defined func with values
  function invokeFunc(fn, argValues) {
    if (typeof fn === 'function') return fn(...argValues);
    if (fn && fn._tag === 'func') return callUserFuncValues(fn, argValues);
    return null;
  }

  function evalMethodCall(obj, method, argNodes, env) {
    const args = argNodes.map(a => evalNode(a, env));

    if (isPath(obj)) {
      if (method === 'length') return obj.segs.length;
      if (method === 'size') return obj.segs.length;
      if (method === 'reverse') {
        const rev = obj.segs.slice().reverse().map(s => makeSeg(s.p3, s.cp2, s.cp1, s.p0));
        return makePath(rev, obj.closed);
      }
    }

    if (isArray(obj)) {
      if (method === 'length') return obj.length;
      if (method === 'push') { obj.push(args[0]); return null; }
      if (method === 'pop') return obj.pop();
      if (method === 'reverse') return obj.slice().reverse();
      if (method === 'initialized') return args[0] < obj.length && obj[args[0]] !== undefined;
    }

    if (isString(obj)) {
      if (method === 'length') return obj.length;
      if (method === 'substr') return obj.substr(args[0], args[1]);
    }

    // Picture methods
    if (obj && obj._tag === 'picture') {
      if (method === 'fit') return obj; // fit() returns the picture (scaling handled at render)
      if (method === 'add') {
        // pic.add(otherPic) — add commands from other picture
        for (const a of args) {
          if (a && a._tag === 'picture') {
            for (const c of a.commands) obj.commands.push(c);
          }
        }
        return null;
      }
      if (method === 'erase') { obj.commands.length = 0; return null; }
      if (method === 'size') return null; // ignore per-picture size for now
    }

    return null;
  }

  function evalMemberAccess(node, env) {
    const obj = evalNode(node.object, env);
    const m = node.member;
    if (isPair(obj)) {
      if (m === 'x') return obj.x;
      if (m === 'y') return obj.y;
    }
    if (isTriple(obj)) {
      if (m === 'x') return obj.x;
      if (m === 'y') return obj.y;
      if (m === 'z') return obj.z;
    }
    if (isTransform(obj)) {
      if ('abcdef'.includes(m) && m.length === 1) return obj[m];
    }
    if (isPath(obj)) {
      if (m === 'length') return obj.segs.length;
    }
    if (isArray(obj)) {
      if (m === 'length') return obj.length;
    }
    if (isString(obj)) {
      if (m === 'length') return obj.length;
    }
    return null;
  }

  function evalArrayAccess(node, env) {
    const obj = evalNode(node.object, env);
    const idx = toNumber(evalNode(node.index, env));
    if (isArray(obj)) {
      let i = Math.floor(idx);
      if (obj._cyclic && obj.length > 0) i = ((i % obj.length) + obj.length) % obj.length;
      return obj[i];
    }
    if (isString(obj)) return obj[Math.floor(idx)];
    if (isPath(obj)) {
      // path indexing: fraction through the path
      const i = Math.floor(idx);
      const t = idx - i;
      if (i >= 0 && i < obj.segs.length) {
        const s = obj.segs[i];
        return bezierPoint(s, t);
      }
    }
    return null;
  }

  function bezierPoint(seg, t) {
    const u = 1-t;
    return makePair(
      u*u*u*seg.p0.x + 3*u*u*t*seg.cp1.x + 3*u*t*t*seg.cp2.x + t*t*t*seg.p3.x,
      u*u*u*seg.p0.y + 3*u*u*t*seg.cp1.y + 3*u*t*t*seg.cp2.y + t*t*t*seg.p3.y
    );
  }

  function evalCast(node, env) {
    const val = evalNode(node.expr, env);
    switch(node.targetType) {
      case 'int': return Math.floor(toNumber(val));
      case 'real': return toNumber(val);
      case 'string': return String(val);
      case 'bool': return toBool(val);
      case 'pair': return toPair(val);
      default: return val;
    }
  }

  function evalPathExpr(node, env) {
    // First pass: evaluate all nodes, collecting pairs and inline paths
    const elements = []; // {type:'pair',pt,join} or {type:'path',segs,join}
    let hasCycle = false;

    for (let i = 0; i < node.nodes.length; i++) {
      const n = node.nodes[i];
      if (n.isCycle) {
        hasCycle = true;
        continue;
      }
      const val = evalNode(n.point, env);
      if (isPath(val) && val.segs.length > 0) {
        elements.push({type:'path', segs:val.segs, join:n.join});
      } else {
        elements.push({type:'pair', pt:toPair(val), join:n.join});
      }
    }

    // If any inline paths, build segments directly
    const hasInlinePaths = elements.some(e => e.type === 'path');
    if (hasInlinePaths) {
      const allSegs = [];
      let pendingPt = null; // pair waiting to be connected to next element
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (el.type === 'path') {
          const start = el.segs[0].p0;
          // Connect from pending point or previous endpoint to start of path
          if (pendingPt) {
            allSegs.push(lineSegment(pendingPt, start));
            pendingPt = null;
          } else if (allSegs.length > 0) {
            const prev = allSegs[allSegs.length - 1].p3;
            if (Math.abs(prev.x - start.x) > 1e-6 || Math.abs(prev.y - start.y) > 1e-6) {
              allSegs.push(lineSegment(prev, start));
            }
          }
          allSegs.push(...el.segs);
        } else {
          // pair element
          if (pendingPt) {
            // Two consecutive pairs, connect them
            allSegs.push(lineSegment(pendingPt, el.pt));
            pendingPt = null;
          } else if (allSegs.length > 0) {
            const prev = allSegs[allSegs.length - 1].p3;
            if (Math.abs(prev.x - el.pt.x) > 1e-6 || Math.abs(prev.y - el.pt.y) > 1e-6) {
              allSegs.push(lineSegment(prev, el.pt));
            }
          } else {
            // First element with no segments yet — store as pending
            pendingPt = el.pt;
          }
        }
      }
      // Close if cycle
      if (hasCycle && allSegs.length > 0) {
        const first = allSegs[0].p0;
        const last = allSegs[allSegs.length - 1].p3;
        if (Math.abs(first.x - last.x) > 1e-6 || Math.abs(first.y - last.y) > 1e-6) {
          allSegs.push(lineSegment(last, first));
        }
      }
      return makePath(allSegs, hasCycle);
    }

    // Standard path: all elements are pairs
    const points = elements.map(e => e.pt);
    const joins = [];
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].join) joins.push(elements[i].join);
    }

    if (points.length < 2) return makePath([], false);

    // Handle ^^ (path concatenation) - split into separate sub-paths
    // Find ^^ boundaries
    const hathatIndices = [];
    for (let i = 0; i < joins.length; i++) {
      if (joins[i] === '^^') hathatIndices.push(i);
    }

    if (hathatIndices.length > 0) {
      // Split into sub-paths at ^^ boundaries, return a path array
      const allSegs = [];
      let start = 0;
      for (const hi of [...hathatIndices, joins.length]) {
        const subPoints = points.slice(start, hi + 1);
        const subJoins = joins.slice(start, hi);
        if (subPoints.length >= 2) {
          const subSegs = buildPathSegs(subPoints, subJoins, false);
          allSegs.push(...subSegs);
        }
        start = hi + 1;
      }
      return makePath(allSegs, false);
    }

    return makePath(buildPathSegs(points, joins, hasCycle), hasCycle);
  }

  function buildPathSegs(points, joins, hasCycle) {
    // Check if all joins are '--' (straight line)
    const allStraight = joins.every(j => j === '--');

    if (allStraight) {
      const segs = [];
      const len = hasCycle ? points.length : points.length - 1;
      for (let i = 0; i < len; i++) {
        const j = (i+1) % points.length;
        segs.push(lineSegment(points[i], points[j]));
      }
      return segs;
    }

    // Hobby's algorithm for '..' joins
    if (joins.every(j => j === '..')) {
      return hobbySpline(points, hasCycle);
    }

    // Mixed joins: segment by segment
    const segs = [];
    const len = hasCycle ? points.length : points.length - 1;
    for (let i = 0; i < len; i++) {
      const j = (i+1) % points.length;
      if (joins[i] === '--') {
        segs.push(lineSegment(points[i], points[j]));
      } else {
        const s = hobbySpline([points[i], points[j]], false);
        segs.push(...s);
      }
    }
    return segs;
  }

  function evalVarDecl(node, env) {
    let val = null;
    if (node.init) val = evalNode(node.init, env);
    else {
      // Default values by type
      if (node.varType.endsWith('[]')) {
        val = [];
      } else {
        switch(node.varType) {
          case 'int': case 'real': val = 0; break;
          case 'pair': val = makePair(0,0); break;
          case 'triple': val = makeTriple(0,0,0); break;
          case 'pen': val = makePen({}); break;
          case 'path': case 'path3': case 'guide': val = makePath([],false); break;
          case 'transform': val = makeTransform(0,1,0,0,0,1); break;
          case 'string': val = ''; break;
          case 'bool': val = false; break;
          case 'picture': val = {_tag:'picture', commands:[]}; break;
        }
      }
    }
    env.set(node.name, val);
    return val;
  }

  function evalAssignment(node, env) {
    const val = evalNode(node.value, env);
    if (node.target.type === 'Identifier') {
      const name = node.target.name;
      if (node.op === '=') {
        env.update(name, val);
      } else {
        const old = env.get(name);
        const ops = {'+=':T.PLUS, '-=':T.MINUS, '*=':T.STAR, '/=':T.SLASH};
        const result = evalBinaryValues(ops[node.op], old, val);
        env.update(name, result);
      }
      // Track currentpicture reassignment so drawing routes to the right picture
      if (name === 'currentpicture' && val && val._tag === 'picture') {
        currentPic = val;
      }
      // Track currentprojection for 3D rendering
      if (name === 'currentprojection' && val && val._tag === 'projection') {
        projection = val;
      }
      return val;
    }
    if (node.target.type === 'ArrayAccess') {
      const obj = evalNode(node.target.object, env);
      const idx = Math.floor(toNumber(evalNode(node.target.index, env)));
      if (isArray(obj)) obj[idx] = val;
      return val;
    }
    if (node.target.type === 'MemberAccess') {
      const obj = evalNode(node.target.object, env);
      if (isPair(obj)) {
        if (node.target.member === 'x') obj.x = toNumber(val);
        if (node.target.member === 'y') obj.y = toNumber(val);
      }
      if (isArray(obj) && node.target.member === 'cyclic') {
        obj._cyclic = toBool(val);
      }
      return val;
    }
    return val;
  }

  function evalIf(node, env) {
    if (toBool(evalNode(node.cond, env))) {
      return evalNode(node.then, env);
    } else if (node.else) {
      return evalNode(node.else, env);
    }
    return null;
  }

  function evalFor(node, env) {
    const local = createEnv(env);
    if (node.init) evalNode(node.init, local);
    let iters = 0;
    while (true) {
      if (node.cond && !toBool(evalNode(node.cond, local))) break;
      if (++iters > iterationLimit) throw new Error('Loop iteration limit exceeded');
      try {
        if (node.body) evalNode(node.body, local);
      } catch(e) {
        if (e === BREAK_SIG) break;
        if (e === CONTINUE_SIG) { /* continue */ }
        else throw e;
      }
      if (node.update) evalNode(node.update, local);
    }
    return null;
  }

  function evalWhile(node, env) {
    let iters = 0;
    while (toBool(evalNode(node.cond, env))) {
      if (++iters > iterationLimit) throw new Error('Loop iteration limit exceeded');
      try {
        if (node.body) evalNode(node.body, env);
      } catch(e) {
        if (e === BREAK_SIG) break;
        if (e === CONTINUE_SIG) continue;
        throw e;
      }
    }
    return null;
  }

  function evalDoWhile(node, env) {
    let iters = 0;
    do {
      if (++iters > iterationLimit) throw new Error('Loop iteration limit exceeded');
      try {
        if (node.body) evalNode(node.body, env);
      } catch(e) {
        if (e === BREAK_SIG) break;
        if (e === CONTINUE_SIG) continue;
        throw e;
      }
    } while (toBool(evalNode(node.cond, env)));
    return null;
  }

  function evalForEach(node, env) {
    const local = createEnv(env);
    const iterVal = evalNode(node.iter, env);
    if (!isArray(iterVal)) return null;
    let iters = 0;
    for (const item of iterVal) {
      if (++iters > iterationLimit) throw new Error('Loop iteration limit exceeded');
      local.set(node.elemName, item);
      try {
        if (node.body) evalNode(node.body, local);
      } catch(e) {
        if (e === BREAK_SIG) break;
        if (e === CONTINUE_SIG) continue;
        throw e;
      }
    }
    return null;
  }

  function evalFuncDecl(node, env) {
    const func = {_tag:'func', name:node.name, params:node.params, body:node.body, closure:env};
    if (node.name) env.set(node.name, func);
    return func;
  }

  function evalImport(node, env) {
    const mod = node.module.toLowerCase();
    if (mod.includes('olympiad') || mod.includes('cse5') || mod.includes('geometry') || mod.includes('math') || mod.includes('markers') || mod.includes('contour') || mod.includes('palette')) {
      // Gracefully ignored — stubs/features already in stdlib or not needed for 2D rendering
    }
    if (mod.includes('trigmacros')) {
      installGraphPackage(env); // TrigMacros depends on graph
      installTrigMacros(env);
    }
    if (mod.includes('graph')) {
      installGraphPackage(env);
    }
    if (mod.includes('three') || mod.includes('solids') || mod.includes('graph3')) {
      installThreePackage(env);
    }
    return null;
  }

  // ============================================================
  // Standard Library Installation
  // ============================================================

  function installStdlib(env) {
    // Direction constants
    const dirs = {
      N:makePair(0,1), S:makePair(0,-1), E:makePair(1,0), W:makePair(-1,0),
      NE:makePair(Math.SQRT1_2,Math.SQRT1_2), NW:makePair(-Math.SQRT1_2,Math.SQRT1_2),
      SE:makePair(Math.SQRT1_2,-Math.SQRT1_2), SW:makePair(-Math.SQRT1_2,-Math.SQRT1_2),
      NNE:makePair(Math.sin(Math.PI/8),Math.cos(Math.PI/8)),
      NNW:makePair(-Math.sin(Math.PI/8),Math.cos(Math.PI/8)),
      SSE:makePair(Math.sin(Math.PI/8),-Math.cos(Math.PI/8)),
      SSW:makePair(-Math.sin(Math.PI/8),-Math.cos(Math.PI/8)),
      ENE:makePair(Math.cos(Math.PI/8),Math.sin(Math.PI/8)),
      WNW:makePair(-Math.cos(Math.PI/8),Math.sin(Math.PI/8)),
      ESE:makePair(Math.cos(Math.PI/8),-Math.sin(Math.PI/8)),
      WSW:makePair(-Math.cos(Math.PI/8),-Math.sin(Math.PI/8)),
      up:makePair(0,1), down:makePair(0,-1), right:makePair(1,0), left:makePair(-1,0),
    };
    for (const [k,v] of Object.entries(dirs)) env.set(k, v);

    // Named colors — exact Asymptote definitions from plain_pens.asy
    // Base: red=(1,0,0) green=(0,1,0) blue=(0,0,1) cyan=(0,1,1) magenta=(1,0,1) yellow=(1,1,0)
    // pale = 0.25*base + 0.75*white, light = 0.5*base + 0.5*white
    // medium = 0.75*base + 0.25*white, heavy = 0.75*base + 0.25*black
    // deep = 0.5*base + 0.5*black, dark = 0.25*base + 0.75*black
    const ASY_COLORS = {
      black:'#000000', white:'#ffffff',
      gray:'#808080',
      // Primary / secondary
      red:'#ff0000', green:'#00ff00', blue:'#0000ff',
      cyan:'#00ffff', magenta:'#ff00ff', yellow:'#ffff00',
      // Pale (75% white)
      palered:'#ffbfbf', palegreen:'#bfffbf', paleblue:'#bfbfff',
      palecyan:'#bfffff', palemagenta:'#ffbfff', paleyellow:'#ffffbf',
      palegray:'#f2f2f2',
      // Light (50% white)
      lightred:'#ff8080', lightgreen:'#80ff80', lightblue:'#8080ff',
      lightcyan:'#80ffff', lightmagenta:'#ff80ff', lightyellow:'#ffff80',
      lightgray:'#e6e6e6',
      // Medium (25% white)
      mediumred:'#ff4040', mediumgreen:'#40ff40', mediumblue:'#4040ff',
      mediumcyan:'#40ffff', mediummagenta:'#ff40ff', mediumyellow:'#ffff40',
      mediumgray:'#bfbfbf',
      // Heavy (25% black)
      heavyred:'#bf0000', heavygreen:'#00bf00', heavyblue:'#0000bf',
      heavycyan:'#00bfbf', heavymagenta:'#bf00bf', lightolive:'#bfbf00',
      heavygray:'#404040',
      // Deep (50% black)
      deepred:'#800000', deepgreen:'#008000', deepblue:'#000080',
      deepcyan:'#008080', deepmagenta:'#800080', deepyellow:'#808000',
      deepgray:'#1a1a1a',
      // Dark (75% black)
      darkred:'#400000', darkgreen:'#004000', darkblue:'#000040',
      darkcyan:'#004040', darkmagenta:'#400040', darkolive:'#404000',
      darkgray:'#0d0d0d',
      // Tertiary colors (50% mixes on color wheel)
      orange:'#ff8000', fuchsia:'#ff0080', chartreuse:'#80ff00',
      springgreen:'#00ff80', purple:'#8000ff', royalblue:'#0080ff',
      // Aliases
      brown:'#800000',   // = deepred
      olive:'#808000',   // = deepyellow
      darkbrown:'#400000', // = darkred
      pink:'#ffbfff',    // = palemagenta
      salmon:'#ff8080',  // = lightred
    };
    for (const [name, hex] of Object.entries(ASY_COLORS)) {
      const r = parseInt(hex.substr(1,2),16)/255;
      const g = parseInt(hex.substr(3,2),16)/255;
      const b = parseInt(hex.substr(5,2),16)/255;
      env.set(name, makePen({r,g,b}));
    }

    // Constants
    env.set('pi', Math.PI);
    env.set('PI', Math.PI);
    env.set('e', Math.E);
    env.set('inf', Infinity);
    env.set('infinity', Infinity);
    env.set('intMax', 2147483647);
    env.set('intMin', -2147483648);
    env.set('realMax', Number.MAX_VALUE);
    env.set('realMin', Number.MIN_VALUE);
    env.set('I', makePair(0,1));
    env.set('origin', makePair(0,0));
    // Cardinal direction constants
    env.set('N', makePair(0,1));
    env.set('S', makePair(0,-1));
    env.set('E', makePair(1,0));
    env.set('W', makePair(-1,0));
    env.set('NE', makePair(1,1));
    env.set('NW', makePair(-1,1));
    env.set('SE', makePair(1,-1));
    env.set('SW', makePair(-1,-1));
    env.set('up', makePair(0,1));
    env.set('down', makePair(0,-1));
    env.set('right', makePair(1,0));
    env.set('left', makePair(-1,0));
    env.set('nullpath', makePath([],false));
    env.set('nullpen', makePen({opacity:0}));
    env.set('currentpen', makePen({}));
    env.set('currentpicture', currentPic);
    env.set('currentprojection', null);
    // add() composites a picture into currentpicture, optionally with transform
    env.set('add', (...args) => {
      let pic = null, t = null;
      for (const a of args) {
        if (a && a._tag === 'picture') pic = a;
        else if (isTransform(a)) t = a;
      }
      if (pic) {
        const cmds = t ? pic.commands.map(c => transformDrawCmd(t, c)) : pic.commands;
        for (const c of cmds) currentPic.commands.push(c);
      }
    });
    env.set('invisible', makePen({opacity:0}));
    env.set('solid', makePen({linestyle:'solid'}));

    // Unit circle: 4 cubic Bezier segments approximating a circle
    const K = 0.5522847498;
    env.set('unitcircle', makePath([
      makeSeg({x:1,y:0},{x:1,y:K},{x:K,y:1},{x:0,y:1}),
      makeSeg({x:0,y:1},{x:-K,y:1},{x:-1,y:K},{x:-1,y:0}),
      makeSeg({x:-1,y:0},{x:-1,y:-K},{x:-K,y:-1},{x:0,y:-1}),
      makeSeg({x:0,y:-1},{x:K,y:-1},{x:1,y:-K},{x:1,y:0}),
    ], true));

    // Unitsquare
    env.set('unitsquare', makePath([
      lineSegment({x:0,y:0},{x:1,y:0}),
      lineSegment({x:1,y:0},{x:1,y:1}),
      lineSegment({x:1,y:1},{x:0,y:1}),
      lineSegment({x:0,y:1},{x:0,y:0}),
    ], true));

    // Line style pens
    env.set('dashed', makePen({linestyle:'dashed'}));
    env.set('dotted', makePen({linestyle:'dotted'}));
    env.set('longdashed', makePen({linestyle:'longdashed'}));
    env.set('dashdotted', makePen({linestyle:'dashdotted'}));
    env.set('longdashdotted', makePen({linestyle:'longdashdotted'}));

    // Line cap/join pens
    env.set('squarecap', makePen({linecap:'butt'}));
    env.set('roundcap', makePen({linecap:'round'}));
    env.set('extendcap', makePen({linecap:'square'}));
    env.set('miterjoin', makePen({linejoin:'miter'}));
    env.set('roundjoin', makePen({linejoin:'round'}));
    env.set('beveljoin', makePen({linejoin:'bevel'}));

    // Units
    env.set('bp', 1);
    env.set('pt', 1);
    env.set('cm', 28.35);
    env.set('mm', 2.835);
    env.set('inch', 72);

    // Dot sizing
    env.set('dotfactor', 6);

    // Math functions
    env.set('sin', (x) => Math.sin(toNumber(x)));
    env.set('cos', (x) => Math.cos(toNumber(x)));
    env.set('tan', (x) => Math.tan(toNumber(x)));
    env.set('asin', (x) => Math.asin(toNumber(x)));
    env.set('acos', (x) => Math.acos(toNumber(x)));
    env.set('atan', (x) => Math.atan(toNumber(x)));
    env.set('atan2', (y,x) => Math.atan2(toNumber(y),toNumber(x)));
    env.set('sqrt', (x) => Math.sqrt(toNumber(x)));
    env.set('abs', (x) => {
      if (isTriple(x)) return Math.sqrt(x.x*x.x + x.y*x.y + x.z*x.z);
      if (isPair(x)) return Math.sqrt(x.x*x.x + x.y*x.y);
      return Math.abs(toNumber(x));
    });
    env.set('log', (x) => Math.log(toNumber(x)));
    env.set('exp', (x) => Math.exp(toNumber(x)));
    env.set('log10', (x) => Math.log10(toNumber(x)));
    env.set('pow', (b,e) => Math.pow(toNumber(b),toNumber(e)));
    env.set('min', (...args) => {
      if (args.length===1 && isArray(args[0])) return Math.min(...args[0].map(toNumber));
      return Math.min(...args.map(toNumber));
    });
    env.set('max', (...args) => {
      if (args.length===1 && isArray(args[0])) return Math.max(...args[0].map(toNumber));
      return Math.max(...args.map(toNumber));
    });
    env.set('floor', (x) => Math.floor(toNumber(x)));
    env.set('ceil', (x) => Math.ceil(toNumber(x)));
    env.set('round', (x) => Math.round(toNumber(x)));
    env.set('sgn', (x) => Math.sign(toNumber(x)));
    env.set('fmod', (x,y) => toNumber(x) % toNumber(y));
    env.set('degrees', (x) => toNumber(x) * 180 / Math.PI);
    env.set('radians', (x) => toNumber(x) * Math.PI / 180);
    env.set('Degrees', (x) => toNumber(x));  // already in degrees in Asymptote context
    env.set('Sin', (x) => Math.sin(toNumber(x)*Math.PI/180));
    env.set('Cos', (x) => Math.cos(toNumber(x)*Math.PI/180));
    env.set('Tan', (x) => Math.tan(toNumber(x)*Math.PI/180));
    env.set('aSin', (x) => Math.asin(toNumber(x))*180/Math.PI);
    env.set('aCos', (x) => Math.acos(toNumber(x))*180/Math.PI);
    env.set('aTan', (x) => Math.atan(toNumber(x))*180/Math.PI);

    // Pair functions
    env.set('dir', (...args) => {
      if (args.length === 1) {
        if (isTriple(args[0])) {
          const t = args[0];
          const len = Math.sqrt(t.x*t.x + t.y*t.y + t.z*t.z);
          return len > 0 ? makeTriple(t.x/len, t.y/len, t.z/len) : makeTriple(0,0,0);
        }
        const a = toNumber(args[0]);
        return makePair(Math.cos(a*Math.PI/180), Math.sin(a*Math.PI/180));
      }
      return makePair(1,0);
    });
    env.set('unit', (p) => {
      if (isTriple(p)) {
        const len = Math.sqrt(p.x*p.x + p.y*p.y + p.z*p.z);
        return len > 0 ? makeTriple(p.x/len, p.y/len, p.z/len) : makeTriple(0,0,0);
      }
      const pp = toPair(p);
      const len = Math.sqrt(pp.x*pp.x + pp.y*pp.y);
      return len > 0 ? makePair(pp.x/len, pp.y/len) : makePair(0,0);
    });
    env.set('length', (v) => {
      if (isPath(v)) return v.segs.length;
      if (isArray(v)) return v.length;
      if (isString(v)) return v.length;
      if (isPair(v)) return Math.sqrt(v.x*v.x + v.y*v.y);
      return toNumber(v);
    });
    env.set('angle', (p) => {
      const pp = toPair(p);
      return Math.atan2(pp.y, pp.x);
    });
    env.set('conj', (p) => { const pp = toPair(p); return makePair(pp.x, -pp.y); });
    env.set('expi', (a) => { const v = toNumber(a); return makePair(Math.cos(v), Math.sin(v)); });
    env.set('xpart', (p) => toPair(p).x);
    env.set('ypart', (p) => toPair(p).y);
    env.set('dot', (...args) => evalDot(args));

    // Path constructors
    env.set('circle', (center, r) => {
      const c = toPair(center);
      const rad = toNumber(r);
      return makeCirclePath(c, rad);
    });
    env.set('Circle', (center, r) => {
      const c = toPair(center);
      const rad = toNumber(r);
      return makeCirclePath(c, rad);
    });

    env.set('arc', (...args) => {
      if (args.length >= 4) {
        // arc(center, radius, startAngle, endAngle)
        const c = toPair(args[0]);
        return makeArcPath(c, toNumber(args[1]), toNumber(args[2]), toNumber(args[3]));
      }
      if (args.length >= 3 && isPair(args[1])) {
        // arc(center, point1, point2) — arc from p1 to p2 around center
        const c = toPair(args[0]);
        const p1 = toPair(args[1]), p2 = toPair(args[2]);
        const r = Math.sqrt((p1.x-c.x)*(p1.x-c.x) + (p1.y-c.y)*(p1.y-c.y));
        const a1 = Math.atan2(p1.y-c.y, p1.x-c.x) * 180 / Math.PI;
        const a2 = Math.atan2(p2.y-c.y, p2.x-c.x) * 180 / Math.PI;
        return makeArcPath(c, r, a1, a2);
      }
      if (args.length >= 2) {
        const c = toPair(args[0]);
        return makeArcPath(c, toNumber(args[1]), 0, 360);
      }
      return makePath([], false);
    });

    env.set('ellipse', (center, a, b) => {
      const c = toPair(center);
      const rx = toNumber(a), ry = toNumber(b);
      const circ = makeCirclePath({x:0,y:0}, 1);
      const t = makeTransform(c.x, rx, 0, c.y, 0, ry);
      return applyTransformPath(t, circ);
    });

    env.set('box', (p1, p2) => {
      const a = toPair(p1), b = toPair(p2);
      return makePath([
        lineSegment(a, {x:b.x,y:a.y}),
        lineSegment({x:b.x,y:a.y}, b),
        lineSegment(b, {x:a.x,y:b.y}),
        lineSegment({x:a.x,y:b.y}, a),
      ], true);
    });

    env.set('polygon', (n) => {
      const sides = Math.floor(toNumber(n));
      if (sides < 3) return makePath([], false);
      const pts = [];
      for (let i = 0; i < sides; i++) {
        const angle = 2*Math.PI*i/sides + Math.PI/2;
        pts.push({x: Math.cos(angle), y: Math.sin(angle)});
      }
      const segs = [];
      for (let i = 0; i < sides; i++) segs.push(lineSegment(pts[i], pts[(i+1)%sides]));
      return makePath(segs, true);
    });

    // grid(Nx, Ny, pen) — returns a picture with grid lines from (0,0) to (Nx, Ny)
    env.set('grid', (...args) => {
      let nx = 1, ny = 1, pen = clonePen(defaultPen);
      for (const a of args) {
        if (isPen(a)) pen = a;
        else if (typeof a === 'number') {
          if (nx === 1 && args.indexOf(a) === 0) nx = Math.round(a);
          else ny = Math.round(a);
        }
      }
      const pic = {_tag:'picture', commands:[], transform: null};
      // Vertical lines
      for (let i = 0; i <= nx; i++) {
        const p = makePath([lineSegment({x:i,y:0}, {x:i,y:ny})], false);
        pic.commands.push({cmd:'draw', path:p, pen:clonePen(pen), arrow:null, line:0});
      }
      // Horizontal lines
      for (let j = 0; j <= ny; j++) {
        const p = makePath([lineSegment({x:0,y:j}, {x:nx,y:j})], false);
        pic.commands.push({cmd:'draw', path:p, pen:clonePen(pen), arrow:null, line:0});
      }
      return pic;
    });

    // Path query functions
    // Internal helper for path point evaluation (avoids env.get shadowing issues)
    function _pointOnPath(p, t) {
      if (!isPath(p)) return makePair(0,0);
      const time = toNumber(t);
      const i = Math.floor(time);
      const frac = time - i;
      const idx = Math.max(0, Math.min(i, p.segs.length-1));
      if (p.segs.length === 0) return makePair(0,0);
      return bezierPoint(p.segs[idx], Math.max(0, Math.min(1, frac)));
    }

    env.set('point', (p, t) => _pointOnPath(p, t));

    env.set('relpoint', (p, t) => {
      if (!isPath(p)) return makePair(0,0);
      const time = toNumber(t) * p.segs.length;
      return _pointOnPath(p, time);
    });

    env.set('midpoint', (...args) => {
      if (args.length === 1 && isPath(args[0])) {
        const p = args[0];
        return _pointOnPath(p, p.segs.length/2);
      }
      // midpoint of two pairs
      if (args.length === 2) {
        const a = toPair(args[0]), b = toPair(args[1]);
        return makePair((a.x+b.x)/2, (a.y+b.y)/2);
      }
      return makePair(0,0);
    });

    env.set('arclength', (p) => {
      if (!isPath(p)) return 0;
      let len = 0;
      for (const s of p.segs) len += bezierArcLength(s);
      return len;
    });

    env.set('reverse', (p) => {
      if (!isPath(p)) return p;
      const rev = p.segs.slice().reverse().map(s => makeSeg(s.p3,s.cp2,s.cp1,s.p0));
      return makePath(rev, p.closed);
    });

    // buildcycle: construct closed region from multiple paths
    env.set('buildcycle', (...paths) => {
      // Concatenate all paths into one closed path
      // For the common case of 2 paths that share endpoints,
      // join them end-to-end and close
      const allSegs = [];
      for (const p of paths) {
        if (!isPath(p)) continue;
        const segs = p.segs;
        if (segs.length === 0) continue;
        // If there's a gap between previous end and this start, add a line segment
        if (allSegs.length > 0) {
          const prev = allSegs[allSegs.length - 1];
          const next = segs[0];
          const dx = prev.p3.x - next.p0.x, dy = prev.p3.y - next.p0.y;
          if (dx*dx + dy*dy > 1e-6) {
            allSegs.push(lineSegment(prev.p3, next.p0));
          }
        }
        for (const s of segs) allSegs.push(s);
      }
      return makePath(allSegs, true);
    });

    env.set('subpath', (p, a, b) => {
      if (!isPath(p)) return p;
      // Simplified: extract segments in range
      const segs = [];
      const start = Math.max(0, Math.floor(toNumber(a)));
      const end = Math.min(p.segs.length, Math.ceil(toNumber(b)));
      for (let i = start; i < end; i++) segs.push(p.segs[i]);
      return makePath(segs, false);
    });

    // Transform constructors
    env.set('shift', (...args) => {
      if (args.length === 1) {
        const p = toPair(args[0]);
        return makeTransform(p.x,1,0,p.y,0,1);
      }
      return makeTransform(toNumber(args[0]),1,0,toNumber(args[1]),0,1);
    });
    env.set('rotate', (angle, center) => {
      const a = toNumber(angle) * Math.PI / 180;
      const c = Math.cos(a), s = Math.sin(a);
      if (center) {
        const p = toPair(center);
        return makeTransform(
          p.x - c*p.x + s*p.y, c, -s,
          p.y - s*p.x - c*p.y, s, c
        );
      }
      return makeTransform(0, c, -s, 0, s, c);
    });
    env.set('scale', (...args) => {
      if (args.length === 1) {
        const s = toNumber(args[0]);
        return makeTransform(0,s,0,0,0,s);
      }
      return makeTransform(0,toNumber(args[0]),0,0,0,toNumber(args[1]));
    });
    env.set('xscale', (s) => makeTransform(0,toNumber(s),0,0,0,1));
    env.set('yscale', (s) => makeTransform(0,1,0,0,0,toNumber(s)));
    env.set('reflect', (a, b) => {
      const p1 = toPair(a), p2 = toPair(b);
      const dx = p2.x-p1.x, dy = p2.y-p1.y;
      const d2 = dx*dx + dy*dy;
      if (d2 === 0) return makeTransform(0,1,0,0,0,1);
      const c = (dx*dx-dy*dy)/d2, s = 2*dx*dy/d2;
      return makeTransform(
        p1.x - c*p1.x - s*p1.y, c, s,
        p1.y - s*p1.x + c*p1.y, s, -c
      );
    });
    env.set('slant', (s) => makeTransform(0,1,toNumber(s),0,0,1));

    // Pen constructors
    env.set('rgb', (...args) => {
      // rgb(r,g,b) with floats, or rgb("hexstring")
      if (args.length === 1 && isString(args[0])) {
        let hex = args[0].replace(/^#/,'');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        const ri = parseInt(hex.substr(0,2),16)/255;
        const gi = parseInt(hex.substr(2,2),16)/255;
        const bi = parseInt(hex.substr(4,2),16)/255;
        return makePen({r:isNaN(ri)?0:ri, g:isNaN(gi)?0:gi, b:isNaN(bi)?0:bi});
      }
      return makePen({r:toNumber(args[0]),g:toNumber(args[1]),b:toNumber(args[2])});
    });
    env.set('RGB', (r,g,b) => makePen({r:toNumber(r)/255,g:toNumber(g)/255,b:toNumber(b)/255}));
    env.set('linewidth', (w) => makePen({linewidth:toNumber(w), _lwExplicit:true}));
    env.set('fontsize', (s) => makePen({fontsize:toNumber(s)}));
    env.set('linetype', (...args) => {
      // linetype("dash pattern") or linetype(real[])
      let pattern = null;
      if (args.length >= 1 && isString(args[0])) pattern = args[0];
      return makePen({linestyle: pattern || 'dashed'});
    });
    env.set('linecap', (n) => {
      const v = toNumber(n);
      const caps = ['butt','round','square'];
      return makePen({linecap: caps[v] || 'round'});
    });
    env.set('opacity', (a) => makePen({opacity:toNumber(a)}));
    env.set('Pen', (n) => makePen({}));
    env.set('Symbol', (...args) => null);
    env.set('fontcommand', (...args) => makePen({}));
    env.set('cmyk', (c,m,y,k) => {
      const cc=toNumber(c),mm=toNumber(m),yy=toNumber(y),kk=toNumber(k);
      return makePen({r:(1-cc)*(1-kk),g:(1-mm)*(1-kk),b:(1-yy)*(1-kk)});
    });
    // gray is set as a pen constant from ASY_COLORS above.
    // gray(number) is handled specially in the function call evaluator.
    env.set('hsv', (h,s,v) => {
      const hh=toNumber(h)/60, ss=toNumber(s), vv=toNumber(v);
      const c=vv*ss, x=c*(1-Math.abs(hh%2-1)), m=vv-c;
      let r=0,g=0,b=0;
      if(hh<1){r=c;g=x;}else if(hh<2){r=x;g=c;}else if(hh<3){g=c;b=x;}
      else if(hh<4){g=x;b=c;}else if(hh<5){r=x;b=c;}else{r=c;b=x;}
      return makePen({r:r+m,g:g+m,b:b+m});
    });

    // Settings
    env.set('unitsize', (...args) => {
      if (args.length >= 1) { unitScale = toNumber(args[0]); hasUnitScale = true; }
    });
    env.set('size', (...args) => {
      // size(pic, w, h) or size(w, h) or size(w)
      if (args.length > 0 && args[0] && args[0]._tag === 'picture') args = args.slice(1);
      if (args.length >= 1) sizeW = toNumber(args[0]);
      if (args.length >= 2) sizeH = toNumber(args[1]);
    });
    env.set('defaultpen', (p) => {
      if (isPen(p)) defaultPen = mergePens(defaultPen, p);
    });

    // Draw commands - these append to drawCommands
    env.set('draw', (...args) => evalDraw('draw', args));
    env.set('fill', (...args) => evalDraw('fill', args));
    env.set('filldraw', (...args) => evalDraw('filldraw', args));
    env.set('clip', (...args) => evalDraw('clip', args));
    env.set('unfill', (...args) => evalDraw('unfill', args));
    env.set('label', (...args) => evalLabel(args));

    // Intersection
    env.set('extension', (P, Q, R, S) => {
      const p=toPair(P),q=toPair(Q),r=toPair(R),s=toPair(S);
      const d1x=q.x-p.x, d1y=q.y-p.y, d2x=s.x-r.x, d2y=s.y-r.y;
      const cross = d1x*d2y - d1y*d2x;
      if (Math.abs(cross) < 1e-12) return makePair(0,0);
      const t = ((r.x-p.x)*d2y - (r.y-p.y)*d2x) / cross;
      return makePair(p.x + t*d1x, p.y + t*d1y);
    });

    env.set('intersect', (p1, p2) => {
      if (!isPath(p1) || !isPath(p2)) return [0, 0];
      // Simplified: return first intersection time pair
      // This is a basic implementation
      return [0, 0];
    });

    env.set('intersectionpoint', (p1, p2) => {
      if (!isPath(p1) || !isPath(p2)) return makePair(0,0);
      // Basic: try to find actual intersection
      for (const s1 of p1.segs) {
        for (const s2 of p2.segs) {
          const ip = bezierBezierIntersect(s1, s2);
          if (ip) return ip;
        }
      }
      return makePair(0,0);
    });

    env.set('intersectionpoints', (p1, p2) => {
      if (!isPath(p1) || !isPath(p2)) return [];
      const pts = [];
      for (const s1 of p1.segs) {
        for (const s2 of p2.segs) {
          const ips = bezierBezierAllIntersections(s1, s2);
          for (const ip of ips) {
            // Deduplicate across segments
            let dup = false;
            for (const p of pts) {
              if (Math.abs(p.x - ip.x) < 0.001 && Math.abs(p.y - ip.y) < 0.001) { dup = true; break; }
            }
            if (!dup) pts.push(ip);
          }
        }
      }
      return pts;
    });

    // Geometry (olympiad/cse5 package)
    env.set('circumcenter', (A,B,C) => {
      const a=toPair(A),b=toPair(B),c=toPair(C);
      const D = 2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
      if(Math.abs(D)<1e-12) return makePair(0,0);
      const ux = ((a.x*a.x+a.y*a.y)*(b.y-c.y)+(b.x*b.x+b.y*b.y)*(c.y-a.y)+(c.x*c.x+c.y*c.y)*(a.y-b.y))/D;
      const uy = ((a.x*a.x+a.y*a.y)*(c.x-b.x)+(b.x*b.x+b.y*b.y)*(a.x-c.x)+(c.x*c.x+c.y*c.y)*(b.x-a.x))/D;
      return makePair(ux,uy);
    });

    env.set('circumradius', (A,B,C) => {
      const o = invokeFunc(env.get('circumcenter'), [A,B,C]);
      const a = toPair(A);
      return Math.sqrt((a.x-o.x)*(a.x-o.x)+(a.y-o.y)*(a.y-o.y));
    });

    env.set('circumcircle', (A,B,C) => {
      const o = invokeFunc(env.get('circumcenter'), [A,B,C]);
      const r = invokeFunc(env.get('circumradius'), [A,B,C]);
      return makeCirclePath(o, r);
    });

    env.set('incenter', (A,B,C) => {
      const a=toPair(A),b=toPair(B),c=toPair(C);
      const ab=Math.sqrt((b.x-a.x)*(b.x-a.x)+(b.y-a.y)*(b.y-a.y));
      const bc=Math.sqrt((c.x-b.x)*(c.x-b.x)+(c.y-b.y)*(c.y-b.y));
      const ca=Math.sqrt((a.x-c.x)*(a.x-c.x)+(a.y-c.y)*(a.y-c.y));
      const p = ab+bc+ca;
      if(p<1e-12) return makePair(0,0);
      return makePair((bc*a.x+ca*b.x+ab*c.x)/p, (bc*a.y+ca*b.y+ab*c.y)/p);
    });

    env.set('inradius', (A,B,C) => {
      const a=toPair(A),b=toPair(B),c=toPair(C);
      const ab=Math.sqrt((b.x-a.x)*(b.x-a.x)+(b.y-a.y)*(b.y-a.y));
      const bc=Math.sqrt((c.x-b.x)*(c.x-b.x)+(c.y-b.y)*(c.y-b.y));
      const ca=Math.sqrt((a.x-c.x)*(a.x-c.x)+(a.y-c.y)*(a.y-c.y));
      const s = (ab+bc+ca)/2;
      return Math.sqrt(Math.max(0,(s-ab)*(s-bc)*(s-ca)/s));
    });

    env.set('incircle', (A,B,C) => {
      const o = invokeFunc(env.get('incenter'), [A,B,C]);
      const r = invokeFunc(env.get('inradius'), [A,B,C]);
      return makeCirclePath(o, r);
    });

    env.set('foot', (P, A, B) => {
      const p=toPair(P),a=toPair(A),b=toPair(B);
      const dx=b.x-a.x, dy=b.y-a.y;
      const t = ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy);
      return makePair(a.x+t*dx, a.y+t*dy);
    });

    env.set('bisectorpoint', (A, B) => {
      const a=toPair(A),b=toPair(B);
      return makePair((a.x+b.x)/2, (a.y+b.y)/2);
    });

    env.set('centroid', (A,B,C) => {
      const a=toPair(A),b=toPair(B),c=toPair(C);
      return makePair((a.x+b.x+c.x)/3, (a.y+b.y+c.y)/3);
    });

    env.set('orthocenter', (A,B,C) => {
      const a=toPair(A),b=toPair(B),c=toPair(C);
      const cc = invokeFunc(env.get('circumcenter'), [A,B,C]);
      // H = A + B + C - 2*O
      return makePair(a.x+b.x+c.x-2*cc.x, a.y+b.y+c.y-2*cc.y);
    });

    // Right angle mark: draws a small square at vertex B
    env.set('rightanglemark', (A, B, C, ...rest) => {
      const a = toPair(A), b = toPair(B), c = toPair(C);
      const rawS = rest.length > 0 ? toNumber(rest[0]) : 10;
      const msf = env.get('markscalefactor') || 0.03;
      const s = rawS * msf;
      // Normalize BA and BC directions
      const ba = {x: a.x-b.x, y: a.y-b.y};
      const bc = {x: c.x-b.x, y: c.y-b.y};
      const lenBA = Math.sqrt(ba.x*ba.x + ba.y*ba.y) || 1;
      const lenBC = Math.sqrt(bc.x*bc.x + bc.y*bc.y) || 1;
      const uBA = {x: ba.x/lenBA*s, y: ba.y/lenBA*s};
      const uBC = {x: bc.x/lenBC*s, y: bc.y/lenBC*s};
      // Three corners of the right angle mark
      const p1 = makePair(b.x + uBA.x, b.y + uBA.y);
      const p2 = makePair(b.x + uBA.x + uBC.x, b.y + uBA.y + uBC.y);
      const p3 = makePair(b.x + uBC.x, b.y + uBC.y);
      return makePath([lineSegment(p1,p2), lineSegment(p2,p3)], false);
    });

    // anglemark: draw arc showing angle at vertex B from BA to BC
    env.set('anglemark', (...args) => {
      if (args.length < 3) return makePath([], false);
      const A = toPair(args[0]), B = toPair(args[1]), C = toPair(args[2]);
      const rawR = args.length > 3 ? toNumber(args[3]) : 10;
      const msf = env.get('markscalefactor') || 0.03;
      const r = rawR * msf;
      const a1 = Math.atan2(C.y - B.y, C.x - B.x) * 180 / Math.PI;
      const a2 = Math.atan2(A.y - B.y, A.x - B.x) * 180 / Math.PI;
      return makeArcPath(B, r, a1, a2);
    });

    // Labeling helpers
    env.set('Label', (...args) => {
      // Return a label object with text and optional alignment/position info
      let text = '';
      let align = null;
      let position = null;
      for (const a of args) {
        if (isString(a)) text = a;
        else if (isPen(a)) { /* pens in Label are ignored (e.g. Label("%4g",black)) */ }
        else if (isPair(a)) align = a;
        else if (a && typeof a === 'object' && a._named) {
          if ('position' in a) position = a.position;
          if ('align' in a) {
            if (isPair(a.align)) align = a.align;
            else if (typeof a.align === 'number') align = makePair(a.align, 0);
          }
        }
        else if (typeof a === 'number' && position === null) position = a;
      }
      const lbl = {_tag:'label', text, align};
      if (position !== null) lbl.position = position;
      return lbl;
    });
    env.set('EndPoint', 1);
    env.set('BeginPoint', 0);
    env.set('MidPoint', 0.5);

    // String functions
    env.set('string', (x) => {
      if (isPair(x)) return `(${x.x},${x.y})`;
      return String(x);
    });
    env.set('format', (fmt, ...vals) => {
      // Simplified format
      let s = String(fmt);
      for (const v of vals) s = s.replace(/%[^%]*[dfegs]/, String(toNumber(v)));
      return s;
    });
    env.set('substr', (s, start, len) => String(s).substr(toNumber(start), len !== undefined ? toNumber(len) : undefined));
    env.set('find', (s, sub) => String(s).indexOf(String(sub)));
    env.set('replace', (s, from, to) => String(s).replace(String(from), String(to)));
    env.set('split', (s, delim) => String(s).split(delim !== undefined ? String(delim) : ','));
    env.set('minipage', (...args) => {
      // Return the string content, ignoring width/formatting
      for (const a of args) { if (isString(a)) return a; }
      return '';
    });

    // Array functions
    env.set('copy', (arr) => {
      if (isArray(arr)) return arr.slice();
      return arr;
    });
    env.set('array', (...args) => args);
    env.set('sequence', (f, n) => {
      // sequence(n) or sequence(func, n)
      if (n === undefined) { n = f; f = null; }
      const result = [];
      const count = Math.floor(toNumber(n));
      for (let i = 0; i < count; i++) {
        if (typeof f === 'function') result.push(f(i));
        else if (f && f._tag === 'func') result.push(callUserFuncValues(f, [i]));
        else result.push(i);
      }
      return result;
    });
    env.set('map', (f, arr) => {
      if (!isArray(arr)) return [];
      if (typeof f === 'function') return arr.map(f);
      if (f && f._tag === 'func') return arr.map(v => callUserFuncValues(f, [v]));
      return [];
    });
    env.set('sort', (arr) => {
      if (!isArray(arr)) return arr;
      return arr.slice().sort((a,b) => toNumber(a) - toNumber(b));
    });

    // Misc
    env.set('assert', (cond, msg) => {
      if (!toBool(cond)) throw new Error('Assertion failed: ' + (msg || ''));
    });
    env.set('write', (...args) => { /* no-op in browser */ });
    env.set('quotient', (a,b) => Math.floor(toNumber(a)/toNumber(b)));
    env.set('unitrand', () => Math.random());

    // Arrow style markers (stored as values for detection)
    const arrowNames = ['Arrow','MidArrow','EndArrow','BeginArrow','Arrows',
      'ArcArrow','ArcArrows','Bar','Bars','None'];
    for (const name of arrowNames) {
      env.set(name, (...args) => ({_tag:'arrow', style:name, size: args.length>0?toNumber(args[0]):6}));
    }

    // Fill types — return tagged objects so label rendering can detect them
    env.set('FillDraw', (...args) => {
      const pen = args.length >= 1 && isPen(args[0]) ? args[0] : makePen({r:1,g:1,b:1});
      return {_tag:'filltype', style:'FillDraw', pen};
    });
    env.set('Fill', (...args) => {
      const pen = args.length >= 1 && isPen(args[0]) ? args[0] : makePen({r:1,g:1,b:1});
      return {_tag:'filltype', style:'Fill', pen};
    });
    env.set('Draw', (...args) => {
      const pen = args.length >= 1 && isPen(args[0]) ? args[0] : null;
      return {_tag:'filltype', style:'Draw', pen};
    });
    env.set('NoFill', {_tag:'filltype', style:'NoFill', pen:null});
    env.set('UnFill', {_tag:'filltype', style:'UnFill', pen:makePen({r:1,g:1,b:1})});

    // Margin types
    env.set('Margins', null);
    env.set('TrueMargin', (...args) => null);
    env.set('DotMargin', null);
    env.set('DotMargins', null);
    env.set('NoMargin', null);
    env.set('BeginMargin', null);
    env.set('EndMargin', null);
    env.set('Margin', (...args) => null);

    // Arrow head types
    env.set('TeXHead', null);
    env.set('HookHead', null);
    env.set('SimpleHead', null);

    // markangle and related
    env.set('markangle', (...args) => null);
    env.set('markers', null);
  }

  // ============================================================
  // Graph Package
  // ============================================================

  let graphPackageInstalled = false;

  // Shared axis limit state (accessible from both installGraphPackage and execute)
  let _axisLimits = { xmin: null, xmax: null, ymin: null, ymax: null, crop: false };

  function installGraphPackage(env) {
    if (graphPackageInstalled) return;
    graphPackageInstalled = true;

    // Helper: build path from points, using smooth (..) or straight (--) joins
    function buildGraphPath(pts, useSmooth) {
      if (pts.length < 2) return makePath([], false);
      if (useSmooth) {
        // Catmull-Rom-style smooth curve
        const segs = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i], p1 = pts[i+1];
          const prev = i > 0 ? pts[i-1] : null;
          const next = i < pts.length - 2 ? pts[i+2] : null;
          const dx = p1.x - p0.x, dy = p1.y - p0.y;
          const len = Math.sqrt(dx*dx + dy*dy) / 3;
          let tx0 = dx, ty0 = dy;
          if (prev) { tx0 = (p1.x - prev.x)/2; ty0 = (p1.y - prev.y)/2; }
          let tx1 = dx, ty1 = dy;
          if (next) { tx1 = (next.x - p0.x)/2; ty1 = (next.y - p0.y)/2; }
          const tLen0 = Math.sqrt(tx0*tx0+ty0*ty0) || 1;
          const tLen1 = Math.sqrt(tx1*tx1+ty1*ty1) || 1;
          segs.push({
            p0, p3: p1,
            cp1: {x: p0.x + tx0/tLen0*len, y: p0.y + ty0/tLen0*len},
            cp2: {x: p1.x - tx1/tLen1*len, y: p1.y - ty1/tLen1*len}
          });
        }
        return makePath(segs, false);
      }
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        segs.push(lineSegment(pts[i], pts[i+1]));
      }
      return makePath(segs, false);
    }
    // Check if an arg is an operator value
    function isOperator(a) { return a && a._tag === 'operator'; }
    function wantsSmooth(args) {
      for (const a of args) {
        if (isOperator(a) && (a.value === '..' || a.value === '...')) return true;
      }
      return false;
    }

    // graph() function: plot a function over a range
    env.set('graph', (...args) => {
      // Filter out non-essential args: find functions, numbers, arrays, operators, bool3 funcs
      const smooth = wantsSmooth(args);
      // Strip operator/bool3/picture args for cleaner matching
      const coreArgs = args.filter(a => !isOperator(a));

      // graph(real[] x, real[] y) or graph(real[] x, real[] y, operator ..)
      if (coreArgs.length >= 2 && isArray(coreArgs[0]) && isArray(coreArgs[1])) {
        const xs = coreArgs[0], ys = coreArgs[1];
        const pts = [];
        for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
          pts.push({x: toNumber(xs[i]), y: toNumber(ys[i])});
        }
        return buildGraphPath(pts, smooth);
      }

      // Find the function argument(s) and numeric range
      let funcArg = null, funcIdx = -1;
      for (let i = 0; i < coreArgs.length; i++) {
        if (typeof coreArgs[i] === 'function' || (coreArgs[i] && coreArgs[i]._tag === 'func')) {
          // Skip bool3 filter functions (they appear after main function)
          if (funcArg === null) { funcArg = coreArgs[i]; funcIdx = i; }
        }
      }

      if (funcArg !== null) {
        // Gather numeric args after the function
        const nums = [];
        for (let i = funcIdx + 1; i < coreArgs.length; i++) {
          if (typeof coreArgs[i] === 'number') nums.push(coreArgs[i]);
          else if (typeof coreArgs[i] === 'function' || (coreArgs[i] && coreArgs[i]._tag === 'func')) break; // bool3 filter
        }
        const a = nums[0] !== undefined ? nums[0] : 0;
        const b = nums[1] !== undefined ? nums[1] : 1;
        const n = nums[2] !== undefined ? Math.floor(nums[2]) : 100;

        // Check if function returns a pair (parametric curve)
        let isPairFunc = false;
        try {
          const testVal = typeof funcArg === 'function' ? funcArg(a) : callUserFuncValues(funcArg, [a]);
          if (testVal && testVal._tag === 'pair') isPairFunc = true;
        } catch(e) {}

        // Compute y-range limit: if axis limits are set, clip to a reasonable multiple
        const yClipMin = _axisLimits.ymin !== null ? _axisLimits.ymin - (_axisLimits.ymax - _axisLimits.ymin) * 2 : -1e6;
        const yClipMax = _axisLimits.ymax !== null ? _axisLimits.ymax + (_axisLimits.ymax - _axisLimits.ymin) * 2 : 1e6;
        const xClipMin = _axisLimits.xmin !== null ? _axisLimits.xmin - (_axisLimits.xmax - _axisLimits.xmin) * 2 : -1e6;
        const xClipMax = _axisLimits.xmax !== null ? _axisLimits.xmax + (_axisLimits.xmax - _axisLimits.xmin) * 2 : 1e6;

        // Collect all points, then split at discontinuities (out-of-range or large jumps)
        const allPts = [];
        for (let i = 0; i <= n; i++) {
          const t = a + (b - a) * i / n;
          try {
            const result = typeof funcArg === 'function' ? funcArg(t) : callUserFuncValues(funcArg, [t]);
            if (isPairFunc) {
              if (result && result._tag === 'pair' && isFinite(result.x) && isFinite(result.y)) {
                allPts.push({x: result.x, y: result.y});
              } else {
                allPts.push(null); // discontinuity marker
              }
            } else {
              const y = toNumber(result);
              if (isFinite(y) && y >= yClipMin && y <= yClipMax) {
                allPts.push({x: t, y});
              } else {
                allPts.push(null); // discontinuity marker
              }
            }
          } catch(e) { allPts.push(null); }
        }

        // Split into segments at null markers and large jumps
        const segments = [];
        let curSeg = [];
        for (let i = 0; i < allPts.length; i++) {
          const pt = allPts[i];
          if (!pt) {
            if (curSeg.length >= 2) segments.push(curSeg);
            curSeg = [];
            continue;
          }
          // Detect large y-jumps (asymptotes) — break path if jump exceeds visible range
          if (curSeg.length > 0) {
            const prev = curSeg[curSeg.length - 1];
            const yRange = (_axisLimits.ymax !== null && _axisLimits.ymin !== null) ? (_axisLimits.ymax - _axisLimits.ymin) : 100;
            if (Math.abs(pt.y - prev.y) > yRange * 2) {
              if (curSeg.length >= 2) segments.push(curSeg);
              curSeg = [];
            }
          }
          curSeg.push(pt);
        }
        if (curSeg.length >= 2) segments.push(curSeg);

        // Build path by joining segments (disconnected pieces become separate subpaths)
        if (segments.length === 0) return makePath([], false);
        if (segments.length === 1) return buildGraphPath(segments[0], smooth);

        // Multiple disconnected segments: build each and concatenate
        let allSegs = [];
        for (const seg of segments) {
          const p = buildGraphPath(seg, smooth);
          for (const s of p.segs) allSegs.push(s);
        }
        return makePath(allSegs, false);
      }

      return makePath([], false);
    });

    // Helper: draw ticks along an axis
    // pic: target picture, extent: null or BottomTop/LeftRight for grid lines
    // crossMin/crossMax: for extent mode, how far tick lines extend in cross direction
    // Compute good tick divisors for range [a,b] (from graph.asy)
    function _tickDivisors(a, b) {
      const n = Math.round(b - a);
      if (n <= 0) return [1];
      const dlist = [1];
      if (n === 1) return [1, 10, 100];
      if (n === 2) return [1, 2];
      const sqrtn = Math.floor(Math.sqrt(n));
      for (let d = 2; d <= sqrtn; d++)
        if (n % d === 0) dlist.push(d);
      for (let d = sqrtn; d >= 1; d--)
        if (n % d === 0) dlist.push(Math.floor(n / d));
      // Remove duplicates and sort
      return [...new Set(dlist)].sort((a, b) => a - b);
    }

    function _drawTicks(ticks, axisDir, min, max, pen, pic, extent, crossMin, crossMax, axisOffset) {
      axisOffset = axisOffset || 0;
      if (!ticks) return;
      if (!pic) pic = currentPic;
      const tickPen = ticks.pen || pen;
      const noZero = ticks.noZero || false;
      const isExtend = extent && (extent === 'BottomTop' || extent === 'LeftRight' ||
                                   extent === 'TopBottom' || extent === 'RightLeft');
      // Tick sizes in world coordinates
      // Default major tick = 0.05 world units, minor = 0.025
      let majorSize = ticks.size > 0 ? ticks.size : 0.05;
      let minorSize = majorSize * 0.5;

      // Compute major tick positions
      let majorPositions;
      let step;
      if (ticks.positions && isArray(ticks.positions)) {
        majorPositions = ticks.positions.map(v => toNumber(v));
        step = majorPositions.length > 1 ? Math.abs(majorPositions[1] - majorPositions[0]) : 1;
      } else {
        step = ticks.step;
        if (step <= 0) {
          // Auto-compute step using Asymptote's divisors algorithm
          const range = max - min;
          const a = Math.ceil(min);
          const b = Math.floor(max);
          if (b > a) {
            const divs = _tickDivisors(a, b);
            // Pick largest divisor count that doesn't overcrowd
            // Asymptote targets roughly 4-8 major ticks
            step = (b - a);
            for (let i = divs.length - 1; i >= 0; i--) {
              const N = divs[i];
              const s = (b - a) / N;
              if (N >= 2 && N <= 10) { step = s; break; }
            }
          } else {
            step = 1;
          }
        }
        if (step <= 0) step = 1;
        majorPositions = [];
        for (let v = Math.ceil(min / step) * step; v <= max + 1e-10; v += step) {
          majorPositions.push(Math.round(v * 1e10) / 1e10);
        }
      }

      // Compute sub-tick positions (minor ticks between major ticks)
      let minorPositions = [];
      if (!isExtend) {
        // Default: 2 sub-ticks per major step (like Asymptote)
        const subN = ticks.subStep > 0 ? Math.round(step / ticks.subStep) : 2;
        if (subN > 1) {
          const subStep = step / subN;
          for (let v = Math.ceil(min / subStep) * subStep; v <= max + 1e-10; v += subStep) {
            const rounded = Math.round(v * 1e10) / 1e10;
            // Skip if it's already a major tick position
            const isMajor = majorPositions.some(m => Math.abs(m - rounded) < 1e-8);
            if (!isMajor) minorPositions.push(rounded);
          }
        }
      }

      const isX = (axisDir === 'x');

      // Draw function for a single tick mark
      function drawTick(v, sz) {
        if (noZero && Math.abs(v) < 1e-10) return;
        if (v < min - 1e-10 || v > max + 1e-10) return;
        let p0, p1;
        if (isExtend) {
          const cMin = crossMin !== undefined ? crossMin : -5;
          const cMax = crossMax !== undefined ? crossMax : 5;
          p0 = isX ? {x:v, y:cMin} : {x:cMin, y:v};
          p1 = isX ? {x:v, y:cMax} : {x:cMax, y:v};
        } else {
          p0 = isX ? {x:v, y:axisOffset-sz} : {x:axisOffset-sz, y:v};
          p1 = isX ? {x:v, y:axisOffset+sz} : {x:axisOffset+sz, y:v};
        }
        const tickPath = makePath([lineSegment(p0, p1)], false);
        pic.commands.push({cmd:'draw', path:tickPath, pen:tickPen, arrow:null, line:0});
      }

      // Draw major ticks
      for (const v of majorPositions) drawTick(v, majorSize);
      // Draw minor ticks
      for (const v of minorPositions) drawTick(v, minorSize);

      // Draw labels for major ticks
      // Suppress labels when Size was explicitly set very small (e.g. Size=0.1pt),
      // which means ticks are invisible markers — labels would be meaningless
      const showLabels = ticks.labels && !isExtend && !(ticks.sizeExplicit && ticks.size < 0.5);
      if (showLabels) {
        for (const v of majorPositions) {
          if (noZero && Math.abs(v) < 1e-10) continue;
          if (v < min - 1e-10 || v > max + 1e-10) continue;
          const pos = isX ? {x:v, y:axisOffset} : {x:axisOffset, y:v};
          const align = isX ? {x:0, y:-1} : {x:-1, y:0};
          let txt;
          if (ticks.format) {
            txt = ticks.format.replace(/%[0-9]*[.]*[0-9]*[dfegs]/g, () => Number.isInteger(v) ? String(v) : v.toFixed(1));
          } else {
            txt = Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
          }
          const labelPen = clonePen(tickPen);
          labelPen.fontsize = 8;
          pic.commands.push({cmd:'label', text:txt, pos, align, pen:labelPen, line:0});
        }
      }
    }

    // Axis extent specifiers — return marker objects that xaxis/yaxis can check
    env.set('BottomTop', (...args) => ({_tag:'axisextent', type:'BottomTop'}));
    env.set('LeftRight', (...args) => ({_tag:'axisextent', type:'LeftRight'}));
    env.set('TopBottom', (...args) => ({_tag:'axisextent', type:'TopBottom'}));
    env.set('RightLeft', (...args) => ({_tag:'axisextent', type:'RightLeft'}));
    env.set('Bottom', (...args) => ({_tag:'axisextent', type:'Bottom'}));
    env.set('Top', (...args) => ({_tag:'axisextent', type:'Top'}));
    env.set('Left', (...args) => ({_tag:'axisextent', type:'Left'}));
    env.set('Right', (...args) => ({_tag:'axisextent', type:'Right'}));

    // YEquals / XEquals — shift axis to a different coordinate
    env.set('YEquals', (...args) => {
      const y = args.length > 0 ? toNumber(args[0]) : 0;
      return {_tag:'axisshift', axis:'x', value:y};
    });
    env.set('XEquals', (...args) => {
      const x = args.length > 0 ? toNumber(args[0]) : 0;
      return {_tag:'axisshift', axis:'y', value:x};
    });

    // xaxis and yaxis
    env.set('xaxis', (...args) => {
      let pic = currentPic;
      let label = '', labelAlign = null, labelPosition = null, xmin = null, xmax = null, pen = null, ticks = null, arrow = null;
      let extent = null; // BottomTop, etc.
      const rawArgs = args;
      let startIdx = 0;
      if (rawArgs.length > 0 && rawArgs[0] && rawArgs[0]._tag === 'picture') {
        pic = rawArgs[0]; startIdx = 1;
      }
      let axisShiftY = 0;
      for (let i = startIdx; i < rawArgs.length; i++) {
        const a = rawArgs[i];
        if (a === null || a === undefined || a === true || a === false) continue;
        if (a && typeof a === 'object' && a._named) {
          if ('ticks' in a) ticks = a.ticks;
          if ('p' in a) pen = a.p;
          if ('pen' in a) pen = a.pen;
          continue;
        }
        if (a && a._tag === 'label') { label = a.text; labelAlign = a.align; if (a.position != null) labelPosition = a.position; }
        else if (a && a._tag === 'axisshift' && a.axis === 'x') { axisShiftY = a.value; }
        else if (isString(a) && !label) label = a;
        else if (typeof a === 'number') {
          if (xmin === null) xmin = a;
          else if (xmax === null) xmax = a;
        }
        else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
        else if (a && a._tag === 'arrow') arrow = a;
        else if (a && a._tag === 'ticks') ticks = a;
        else if (typeof a === 'function') {
          try {
            const r = a();
            if (r && r._tag === 'arrow') arrow = arrow || r;
            else if (r && r._tag === 'axisextent') extent = r.type;
          } catch(e) {}
        }
        else if (a && a._tag === 'axisextent') { extent = a.type; }
      }
      // Auto-range from content bounds if no explicit limits
      if (xmin === null) xmin = _axisLimits.xmin;
      if (xmax === null) xmax = _axisLimits.xmax;
      if (xmin === null || xmax === null) {
        // Compute from picture's existing content
        let cMinX = Infinity, cMaxX = -Infinity;
        for (const dc of pic.commands) {
          if (dc.path && dc.path.segs) {
            for (const seg of dc.path.segs) {
              for (const p of [seg.p0, seg.cp1, seg.cp2, seg.p3]) {
                if (isFinite(p.x)) { if (p.x < cMinX) cMinX = p.x; if (p.x > cMaxX) cMaxX = p.x; }
              }
            }
          }
          if (dc.pos && isFinite(dc.pos.x)) { if (dc.pos.x < cMinX) cMinX = dc.pos.x; if (dc.pos.x > cMaxX) cMaxX = dc.pos.x; }
        }
        if (xmin === null) xmin = isFinite(cMinX) ? cMinX : -5;
        if (xmax === null) xmax = isFinite(cMaxX) ? cMaxX : 5;
      }
      if (!pen) pen = clonePen(defaultPen);
      const isInvisible = pen.opacity === 0;
      // Draw axis line (skip if invisible)
      if (!isInvisible) {
        const path = makePath([lineSegment({x:xmin,y:axisShiftY},{x:xmax,y:axisShiftY})], false);
        pic.commands.push({cmd:'draw', path, pen, arrow, line: 0});
      }
      // Cross range for grid lines
      const crossMin = _axisLimits.ymin !== null ? _axisLimits.ymin : -5;
      const crossMax = _axisLimits.ymax !== null ? _axisLimits.ymax : 5;
      _drawTicks(ticks, 'x', xmin, xmax, pen, pic, extent, crossMin, crossMax, axisShiftY);
      if (label && !isInvisible) {
        const lAlign = labelAlign || {x:1, y:-1};
        let labelX = xmax;
        if (labelPosition != null) labelX = xmin + (xmax - xmin) * labelPosition;
        pic.commands.push({cmd:'label', text: stripLaTeX(label), pos:{x:labelX, y:axisShiftY}, align:lAlign, pen, line:0});
      }
    });

    env.set('yaxis', (...args) => {
      let pic = currentPic;
      let label = '', labelAlign = null, labelPosition = null, ymin = null, ymax = null, pen = null, ticks = null, arrow = null;
      let extent = null;
      const rawArgs = args;
      let startIdx = 0;
      if (rawArgs.length > 0 && rawArgs[0] && rawArgs[0]._tag === 'picture') {
        pic = rawArgs[0]; startIdx = 1;
      }
      let axisShiftX = 0;
      for (let i = startIdx; i < rawArgs.length; i++) {
        const a = rawArgs[i];
        if (a === null || a === undefined || a === true || a === false) continue;
        if (a && typeof a === 'object' && a._named) {
          if ('ticks' in a) ticks = a.ticks;
          if ('p' in a) pen = a.p;
          if ('pen' in a) pen = a.pen;
          continue;
        }
        if (a && a._tag === 'label') { label = a.text; labelAlign = a.align; if (a.position != null) labelPosition = a.position; }
        else if (a && a._tag === 'axisshift' && a.axis === 'y') { axisShiftX = a.value; }
        else if (isString(a) && !label) label = a;
        else if (typeof a === 'number') {
          if (ymin === null) ymin = a;
          else if (ymax === null) ymax = a;
        }
        else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
        else if (a && a._tag === 'arrow') arrow = a;
        else if (typeof a === 'function') {
          try {
            const r = a();
            if (r && r._tag === 'arrow') arrow = arrow || r;
            else if (r && r._tag === 'axisextent') extent = r.type;
          } catch(e) {}
        }
        else if (a && a._tag === 'ticks') ticks = a;
        else if (a && a._tag === 'axisextent') { extent = a.type; }
      }
      // Auto-range from content bounds if no explicit limits
      if (ymin === null) ymin = _axisLimits.ymin;
      if (ymax === null) ymax = _axisLimits.ymax;
      if (ymin === null || ymax === null) {
        let cMinY = Infinity, cMaxY = -Infinity;
        for (const dc of pic.commands) {
          if (dc.path && dc.path.segs) {
            for (const seg of dc.path.segs) {
              for (const p of [seg.p0, seg.cp1, seg.cp2, seg.p3]) {
                if (isFinite(p.y)) { if (p.y < cMinY) cMinY = p.y; if (p.y > cMaxY) cMaxY = p.y; }
              }
            }
          }
          if (dc.pos && isFinite(dc.pos.y)) { if (dc.pos.y < cMinY) cMinY = dc.pos.y; if (dc.pos.y > cMaxY) cMaxY = dc.pos.y; }
        }
        if (ymin === null) ymin = isFinite(cMinY) ? cMinY : -5;
        if (ymax === null) ymax = isFinite(cMaxY) ? cMaxY : 5;
      }
      if (!pen) pen = clonePen(defaultPen);
      const isInvisible = pen.opacity === 0;
      if (!isInvisible) {
        const path = makePath([lineSegment({x:axisShiftX,y:ymin},{x:axisShiftX,y:ymax})], false);
        pic.commands.push({cmd:'draw', path, pen, arrow, line: 0});
      }
      const crossMin = _axisLimits.xmin !== null ? _axisLimits.xmin : -5;
      const crossMax = _axisLimits.xmax !== null ? _axisLimits.xmax : 5;
      _drawTicks(ticks, 'y', ymin, ymax, pen, pic, extent, crossMin, crossMax, axisShiftX);
      if (label && !isInvisible) {
        const lAlign = labelAlign || {x:-1, y:1};
        let labelY = ymax;
        if (labelPosition != null) labelY = ymin + (ymax - ymin) * labelPosition;
        pic.commands.push({cmd:'label', text: stripLaTeX(label), pos:{x:axisShiftX, y:labelY}, align:lAlign, pen, line:0});
      }
    });

    // xequals / yequals — draw vertical/horizontal line at a given coordinate
    env.set('xequals', (...args) => {
      let x = 0, ymin = null, ymax = null, pen = null, ticks = null, arrow = null;
      let gotX = false;
      for (const a of args) {
        if (a === null || a === undefined || a === true || a === false) continue;
        if (typeof a === 'number' && !gotX) { x = a; gotX = true; }
        else if (typeof a === 'number') {
          if (ymin === null) ymin = a;
          else if (ymax === null) ymax = a;
        }
        else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
        else if (a && a._tag === 'arrow') arrow = a;
        else if (a && a._tag === 'ticks') ticks = a;
      }
      if (ymin === null) ymin = -5;
      if (ymax === null) ymax = 5;
      if (!pen) pen = clonePen(defaultPen);
      const path = makePath([lineSegment({x,y:ymin},{x,y:ymax})], false);
      currentPic.commands.push({cmd:'draw', path, pen, arrow, line:0});
      if (ticks) {
        const tickPen = ticks.pen || pen;
        const tickSize = ticks.size || 0.1;
        const positions = ticks.positions && isArray(ticks.positions) ? ticks.positions.map(v=>toNumber(v)) : [];
        if (positions.length === 0 && ticks.step > 0) {
          for (let v = Math.ceil(ymin/ticks.step)*ticks.step; v <= ymax+1e-10; v += ticks.step) positions.push(Math.round(v*1e10)/1e10);
        }
        for (const v of positions) {
          if (ticks.noZero && Math.abs(v) < 1e-10) continue;
          const tp = makePath([lineSegment({x:x-tickSize,y:v},{x:x+tickSize,y:v})], false);
          currentPic.commands.push({cmd:'draw', path:tp, pen:tickPen, arrow:null, line:0});
          if (ticks.labels) {
            currentPic.commands.push({cmd:'label', text:String(Math.round(v*1000)/1000), pos:{x,y:v}, align:{x:-1,y:0}, pen:tickPen, line:0});
          }
        }
      }
    });

    env.set('yequals', (...args) => {
      let y = 0, xmin = null, xmax = null, pen = null, ticks = null, arrow = null;
      let gotY = false;
      for (const a of args) {
        if (a === null || a === undefined || a === true || a === false) continue;
        if (typeof a === 'number' && !gotY) { y = a; gotY = true; }
        else if (typeof a === 'number') {
          if (xmin === null) xmin = a;
          else if (xmax === null) xmax = a;
        }
        else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
        else if (a && a._tag === 'arrow') arrow = a;
        else if (a && a._tag === 'ticks') ticks = a;
      }
      if (xmin === null) xmin = -5;
      if (xmax === null) xmax = 5;
      if (!pen) pen = clonePen(defaultPen);
      const path = makePath([lineSegment({x:xmin,y},{x:xmax,y})], false);
      currentPic.commands.push({cmd:'draw', path, pen, arrow, line:0});
      if (ticks) {
        const tickPen = ticks.pen || pen;
        const tickSize = ticks.size || 0.1;
        const positions = ticks.positions && isArray(ticks.positions) ? ticks.positions.map(v=>toNumber(v)) : [];
        if (positions.length === 0 && ticks.step > 0) {
          for (let v = Math.ceil(xmin/ticks.step)*ticks.step; v <= xmax+1e-10; v += ticks.step) positions.push(Math.round(v*1e10)/1e10);
        }
        for (const v of positions) {
          if (ticks.noZero && Math.abs(v) < 1e-10) continue;
          const tp = makePath([lineSegment({x:v,y:y-tickSize},{x:v,y:y+tickSize})], false);
          currentPic.commands.push({cmd:'draw', path:tp, pen:tickPen, arrow:null, line:0});
          if (ticks.labels) {
            currentPic.commands.push({cmd:'label', text:String(Math.round(v*1000)/1000), pos:{x:v,y}, align:{x:0,y:-1}, pen:tickPen, line:0});
          }
        }
      }
    });

    // axes() - draw both axes
    env.set('axes', (...args) => {
      let xlabel = '', ylabel = '', pen = null, arrow = null, ticks = null;
      for (const a of args) {
        if (isString(a)) {
          if (!xlabel) xlabel = a;
          else if (!ylabel) ylabel = a;
        }
        else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
        else if (a && a._tag === 'arrow') arrow = a;
        else if (a && a._tag === 'ticks') ticks = a;
      }
      const xArgs = []; const yArgs = [];
      if (xlabel) xArgs.push(xlabel);
      if (ylabel) yArgs.push(ylabel);
      if (pen) { xArgs.push(pen); yArgs.push(pen); }
      if (arrow) { xArgs.push(arrow); yArgs.push(arrow); }
      invokeFunc(env.get('xaxis'), xArgs);
      invokeFunc(env.get('yaxis'), yArgs);
    });

    // labelx / labely — place a label on an axis
    env.set('labelx', (...args) => {
      let text = '', x = 0, pen = null;
      for (const a of args) {
        if (isString(a) && !text) text = a;
        else if (typeof a === 'number') x = a;
        else if (isPen(a)) pen = a;
      }
      if (!pen) pen = clonePen(defaultPen);
      currentPic.commands.push({cmd:'label', text: stripLaTeX(text), pos:{x,y:0}, align:{x:0,y:-1}, pen, line:0});
    });
    env.set('labely', (...args) => {
      let text = '', y = 0, pen = null;
      for (const a of args) {
        if (isString(a) && !text) text = a;
        else if (typeof a === 'number') y = a;
        else if (isPen(a)) pen = a;
      }
      if (!pen) pen = clonePen(defaultPen);
      currentPic.commands.push({cmd:'label', text: stripLaTeX(text), pos:{x:0,y}, align:{x:-1,y:0}, pen, line:0});
    });

    // Ticks constructors — accept format string, positions array, Step, pen, Size, etc.
    function _makeTicks(args, defaults) {
      const t = Object.assign({_tag:'ticks', step:0, size:0, sizeExplicit:false, labels:false, noZero:false, positions:null, pen:null, extend:false, subStep:0}, defaults);
      for (const a of args) {
        if (a === null || a === undefined) continue;
        if (typeof a === 'number') {
          // Could be Step or Size — small numbers (<1) are likely Size
          if (a < 0.5) { t.size = a; t.sizeExplicit = true; }
          else t.step = a;
        }
        else if (isString(a)) { /* format string like "%" — stored but does not auto-enable labels */ }
        else if (isPen(a)) t.pen = a;
        else if (isArray(a)) t.positions = a;
        else if (a === true || a === false) t.extend = a;
        else if (a && a._tag === 'label') { t.labels = true; if (a.text) t.format = a.text; }
        else if (a && a._tag === 'tickmod') { if (a.noZero) t.noZero = true; }
        else if (a && typeof a === 'object' && a._named) {
          if ('Step' in a) t.step = a.Step;
          if ('step' in a) t.step = a.step;
          if ('Size' in a) { t.size = a.Size; t.sizeExplicit = true; }
          if ('size' in a) { t.size = a.size; t.sizeExplicit = true; }
          if ('extend' in a) t.extend = a.extend;
          if ('pTick' in a && isPen(a.pTick)) t.pen = a.pTick;
          if ('ptick' in a && isPen(a.ptick)) t.pen = a.ptick;
        }
      }
      return t;
    }
    env.set('Ticks', (...args) => _makeTicks(args, {}));
    env.set('LeftTicks', (...args) => { const t = _makeTicks(args, {}); t.side = 'left'; return t; });
    env.set('RightTicks', (...args) => { const t = _makeTicks(args, {}); t.side = 'right'; return t; });
    env.set('NoTicks', {_tag:'ticks', step:0, size:0, labels:false, noZero:false, positions:null, pen:null});
    env.set('NoZero', {_tag:'tickmod', noZero:true});
    env.set('NoZeroFormat', {_tag:'tickmod', noZero:true});

    // polargraph — plot r = f(theta) in polar coordinates
    env.set('polargraph', (...args) => {
      const smooth = wantsSmooth(args);
      const coreArgs = args.filter(a => !isOperator(a));
      let funcArg = null, a = 0, b = 2*Math.PI, n = 200;
      const nums = [];
      for (const ca of coreArgs) {
        if ((typeof ca === 'function' || (ca && ca._tag === 'func')) && !funcArg) funcArg = ca;
        else if (typeof ca === 'number') nums.push(ca);
      }
      if (nums.length >= 1) a = nums[0];
      if (nums.length >= 2) b = nums[1];
      if (nums.length >= 3) n = Math.floor(nums[2]);
      if (!funcArg) return makePath([], false);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const theta = a + (b - a) * i / n;
        try {
          const r = toNumber(typeof funcArg === 'function' ? funcArg(theta) : callUserFuncValues(funcArg, [theta]));
          if (isFinite(r)) pts.push({x: r*Math.cos(theta), y: r*Math.sin(theta)});
        } catch(e) {}
      }
      return buildGraphPath(pts, smooth || true);
    });

    // Scale types
    env.set('Linear', null);
    env.set('Log', null);
    env.set('Logarithmic', null);
    env.set('Broken', (...args) => null);

    // xlimits/ylimits — store axis ranges for xaxis/yaxis to use
    env.set('xlimits', (...args) => {
      const nums = args.filter(a => typeof a === 'number');
      if (nums.length >= 1) _axisLimits.xmin = nums[0];
      if (nums.length >= 2) _axisLimits.xmax = nums[1];
    });
    env.set('ylimits', (...args) => {
      const nums = args.filter(a => typeof a === 'number');
      if (nums.length >= 1) _axisLimits.ymin = nums[0];
      if (nums.length >= 2) _axisLimits.ymax = nums[1];
    });
    env.set('limits', (...args) => {
      // limits([pic], (xmin,ymin), (xmax,ymax) [,Crop])
      const pairs = [];
      let hasCrop = false;
      for (const a of args) {
        if (isPair(a)) pairs.push(a);
        else if (a === true) hasCrop = true; // Crop is env-set to true
      }
      if (pairs.length >= 2) {
        _axisLimits.xmin = pairs[0].x; _axisLimits.ymin = pairs[0].y;
        _axisLimits.xmax = pairs[1].x; _axisLimits.ymax = pairs[1].y;
      }
      if (hasCrop) _axisLimits.crop = true;
    });
    env.set('Crop', true);
    env.set('NoCrop', false);
    env.set('crop', (...args) => null);
  }

  // ============================================================
  // TrigMacros Package (AoPS custom axes/grid)
  // ============================================================

  function installTrigMacros(env) {
    const ticklength = 0.1 * 28.35; // 0.1cm in bp
    const axisarrowsize = 0.14 * 28.35; // 0.14cm in bp
    const axisPen = makePen({r:0,g:0,b:0,linewidth:1.3});

    env.set('rr_cartesian_axes', (...args) => {
      // Parse args: xleft, xright, ybottom, ytop, then named args
      let xleft = -5, xright = 5, ybottom = -5, ytop = 5;
      let xstep = 1, ystep = 1;
      let useticks = true, complexplane = false, usegrid = true;
      const nums = [];
      for (const a of args) {
        if (typeof a === 'number') nums.push(a);
        else if (typeof a === 'boolean') {
          // Can't distinguish which bool is which from positional args alone
        } else if (a && typeof a === 'object') {
          // Named argument object
        }
      }
      // Positional numeric args
      if (nums.length >= 1) xleft = nums[0];
      if (nums.length >= 2) xright = nums[1];
      if (nums.length >= 3) ybottom = nums[2];
      if (nums.length >= 4) ytop = nums[3];
      if (nums.length >= 5) xstep = nums[4];
      if (nums.length >= 6) ystep = nums[5];
      // Check for named args passed as special objects
      for (const a of args) {
        if (a && typeof a === 'object' && a._named) {
          if ('xstep' in a) xstep = a.xstep;
          if ('ystep' in a) ystep = a.ystep;
          if ('useticks' in a) useticks = a.useticks;
          if ('complexplane' in a) complexplane = a.complexplane;
          if ('usegrid' in a) usegrid = a.usegrid;
        }
      }

      const pic = currentPic;

      // Draw axis labels
      if (complexplane) {
        pic.commands.push({cmd:'label', text:'Re', pos:{x:xright, y:0}, align:{x:1,y:-1}, pen:clonePen(defaultPen), filltype:null, line:0});
        pic.commands.push({cmd:'label', text:'Im', pos:{x:0, y:ytop}, align:{x:-1,y:1}, pen:clonePen(defaultPen), filltype:null, line:0});
      } else {
        pic.commands.push({cmd:'label', text:'$x$', pos:{x:xright+0.4, y:-0.5}, align:null, pen:clonePen(defaultPen), filltype:null, line:0});
        pic.commands.push({cmd:'label', text:'$y$', pos:{x:-0.5, y:ytop+0.2}, align:null, pen:clonePen(defaultPen), filltype:null, line:0});
      }

      // Set axis limits
      if (_axisLimits.xmin === null || xleft < _axisLimits.xmin) _axisLimits.xmin = xleft;
      if (_axisLimits.xmax === null || xright > _axisLimits.xmax) _axisLimits.xmax = xright;
      if (_axisLimits.ymin === null || ybottom < _axisLimits.ymin) _axisLimits.ymin = ybottom;
      if (_axisLimits.ymax === null || ytop > _axisLimits.ymax) _axisLimits.ymax = ytop;

      // Grid lines
      if (usegrid) {
        const gridPen = makePen({r:0.75,g:0.75,b:0.75, linewidth:0.4});
        for (let i = xleft; i <= xright; i += xstep) {
          if (Math.abs(i) > 0.01) {
            const path = makePath([lineSegment({x:i,y:ybottom},{x:i,y:ytop})], false);
            pic.commands.push({cmd:'draw', path, pen:gridPen, arrow:null, line:0});
          }
        }
        for (let i = ybottom; i <= ytop; i += ystep) {
          if (Math.abs(i) > 0.01) {
            const path = makePath([lineSegment({x:xleft,y:i},{x:xright,y:i})], false);
            pic.commands.push({cmd:'draw', path, pen:gridPen, arrow:null, line:0});
          }
        }
      }

      // Draw axis lines with arrows
      const axArrow = {_tag:'arrow', style:'Arrows', size:5};
      // Vertical axis (x=0)
      const vPath = makePath([lineSegment({x:0,y:ybottom},{x:0,y:ytop})], false);
      pic.commands.push({cmd:'draw', path:vPath, pen:clonePen(axisPen), arrow:axArrow, line:0});
      // Horizontal axis (y=0)
      const hPath = makePath([lineSegment({x:xleft,y:0},{x:xright,y:0})], false);
      pic.commands.push({cmd:'draw', path:hPath, pen:clonePen(axisPen), arrow:axArrow, line:0});

      // Tick labels
      const tickPen = clonePen(defaultPen);
      tickPen.fontsize = 8;
      for (let i = xleft + xstep; i < xright; i += xstep) {
        const iv = Math.round(i * 1000) / 1000;
        if (Math.abs(iv) < 0.01) continue;
        const label = Number.isInteger(iv) ? String(iv) : iv.toFixed(1);
        pic.commands.push({cmd:'label', text:'$' + label + '$', pos:{x:iv, y:0}, align:{x:0,y:-1}, pen:clonePen(tickPen), filltype:null, line:0});
        if (useticks) {
          const tPath = makePath([lineSegment({x:iv,y:-0.15},{x:iv,y:0.15})], false);
          pic.commands.push({cmd:'draw', path:tPath, pen:makePen({r:0,g:0,b:0,linewidth:0.8}), arrow:null, line:0});
        }
      }
      for (let i = ybottom + ystep; i < ytop; i += ystep) {
        const iv = Math.round(i * 1000) / 1000;
        if (Math.abs(iv) < 0.01) continue;
        const label = Number.isInteger(iv) ? String(iv) : iv.toFixed(1);
        const suffix = complexplane ? 'i' : '';
        pic.commands.push({cmd:'label', text:'$' + label + suffix + '$', pos:{x:0, y:iv}, align:{x:-1,y:0}, pen:clonePen(tickPen), filltype:null, line:0});
        if (useticks) {
          const tPath = makePath([lineSegment({x:-0.15,y:iv},{x:0.15,y:iv})], false);
          pic.commands.push({cmd:'draw', path:tPath, pen:makePen({r:0,g:0,b:0,linewidth:0.8}), arrow:null, line:0});
        }
      }
    });

    // TrigMacros constants
    env.set('ticklength', ticklength);
    env.set('axisarrowsize', axisarrowsize);
    env.set('axispen', axisPen);
    env.set('vectorarrowsize', 0.2 * 28.35);
  }

  // ============================================================
  // Three Package (3D wireframe)
  // ============================================================

  function installThreePackage(env) {
    // 3D unit vectors and origin
    env.set('X', makeTriple(1,0,0));
    env.set('Y', makeTriple(0,1,0));
    env.set('Z', makeTriple(0,0,1));
    env.set('O', makeTriple(0,0,0));

    // 3D arrow types (treated same as 2D arrows for wireframe rendering)
    env.set('Arrow3', (...args) => {
      let sz = 5;
      for (const a of args) if (typeof a === 'number') sz = a;
      return {_tag:'arrow', style:'Arrow', size:sz};
    });
    env.set('Arrows3', (...args) => {
      let sz = 5;
      for (const a of args) if (typeof a === 'number') sz = a;
      return {_tag:'arrow', style:'Arrows', size:sz};
    });
    env.set('BeginArrow3', (...args) => {
      let sz = 5;
      for (const a of args) if (typeof a === 'number') sz = a;
      return {_tag:'arrow', style:'BeginArrow', size:sz};
    });
    env.set('EndArrow3', (...args) => {
      let sz = 5;
      for (const a of args) if (typeof a === 'number') sz = a;
      return {_tag:'arrow', style:'EndArrow', size:sz};
    });
    env.set('MidArrow3', (...args) => {
      let sz = 5;
      for (const a of args) if (typeof a === 'number') sz = a;
      return {_tag:'arrow', style:'MidArrow', size:sz};
    });
    env.set('NoArrow3', null);

    // Projection constructors
    env.set('orthographic', (...args) => {
      const nums = args.filter(a => typeof a === 'number');
      let cx = 1, cy = -2, cz = 0.5;
      if (nums.length >= 3) { cx = nums[0]; cy = nums[1]; cz = nums[2]; }
      else if (nums.length === 1 && isTriple(args[0])) { cx = args[0].x; cy = args[0].y; cz = args[0].z; }
      const p = {_tag:'projection', type:'orthographic', cx, cy, cz, tx:0, ty:0, tz:0, ux:0, uy:0, uz:1};
      // Apply named args
      for (const a of args) {
        if (isTriple(a) && a !== args[0]) { p.ux = a.x; p.uy = a.y; p.uz = a.z; }
      }
      return p;
    });

    env.set('perspective', (...args) => {
      const nums = args.filter(a => typeof a === 'number');
      let cx = 5, cy = 4, cz = 2;
      if (nums.length >= 3) { cx = nums[0]; cy = nums[1]; cz = nums[2]; }
      else if (args.length >= 1 && isTriple(args[0])) { cx = args[0].x; cy = args[0].y; cz = args[0].z; }
      const p = {_tag:'projection', type:'perspective', cx, cy, cz, tx:0, ty:0, tz:0, ux:0, uy:0, uz:1};
      for (const a of args) {
        if (isTriple(a) && a !== args[0]) { p.ux = a.x; p.uy = a.y; p.uz = a.z; }
      }
      return p;
    });

    env.set('oblique', (...args) => {
      return {_tag:'projection', type:'orthographic', cx:0, cy:-1, cz:0.5, tx:0, ty:0, tz:0, ux:0, uy:0, uz:1};
    });

    // currentprojection — set default if not already set
    if (!projection) {
      projection = {_tag:'projection', type:'orthographic', cx:1, cy:-2, cz:0.5, tx:0, ty:0, tz:0, ux:0, uy:0, uz:1};
      env.set('currentprojection', projection);
    }

    // 3D math functions
    env.set('cross', (a, b) => {
      const u = toTriple(a), v = toTriple(b);
      return makeTriple(u.y*v.z - u.z*v.y, u.z*v.x - u.x*v.z, u.x*v.y - u.y*v.x);
    });

    env.set('normal', (a, b, c) => {
      // Normal to plane through three points
      const u = toTriple(a), v = toTriple(b), w = toTriple(c);
      const dx1 = v.x-u.x, dy1 = v.y-u.y, dz1 = v.z-u.z;
      const dx2 = w.x-u.x, dy2 = w.y-u.y, dz2 = w.z-u.z;
      return makeTriple(dy1*dz2-dz1*dy2, dz1*dx2-dx1*dz2, dx1*dy2-dy1*dx2);
    });

    env.set('interp', (a, b, t) => {
      const frac = toNumber(t);
      if (isTriple(a) || isTriple(b)) {
        const u = toTriple(a), v = toTriple(b);
        return makeTriple(u.x*(1-frac)+v.x*frac, u.y*(1-frac)+v.y*frac, u.z*(1-frac)+v.z*frac);
      }
      if (isPair(a) || isPair(b)) {
        const u = toPair(a), v = toPair(b);
        return makePair(u.x*(1-frac)+v.x*frac, u.y*(1-frac)+v.y*frac);
      }
      return toNumber(a)*(1-frac) + toNumber(b)*frac;
    });

    // Component accessors
    env.set('xpart', v => isTriple(v) ? v.x : (isPair(v) ? v.x : toNumber(v)));
    env.set('ypart', v => isTriple(v) ? v.y : (isPair(v) ? v.y : 0));
    env.set('zpart', v => isTriple(v) ? v.z : 0);

    // 3D path type stubs
    env.set('path3', null);

    // XYplane: maps 2D pair to 3D triple on XY plane (z=0)
    env.set('XYplane', (p) => {
      const pp = toPair(p);
      return makeTriple(pp.x, pp.y, 0);
    });

    // markscalefactor
    env.set('markscalefactor', 0.03);

    // 3D circle approximation (returns a path of projected points)
    env.set('circle', (...args) => {
      // Detect 3D circle: circle(center, radius, normal)
      // If first arg is triple, do 3D circle
      if (args.length >= 2 && isTriple(args[0])) {
        const center = args[0], r = toNumber(args[1]);
        const normal = args.length >= 3 && isTriple(args[2]) ? args[2] : makeTriple(0,0,1);
        // Create circle in plane perpendicular to normal, centered at center
        const nlen = Math.sqrt(normal.x*normal.x + normal.y*normal.y + normal.z*normal.z) || 1;
        const nz = {x:normal.x/nlen, y:normal.y/nlen, z:normal.z/nlen};
        // Find two perpendicular vectors in the plane
        let ax = {x:1,y:0,z:0};
        if (Math.abs(nz.x) > 0.9) ax = {x:0,y:1,z:0};
        // u = normalize(ax cross nz)
        let ux = ax.y*nz.z - ax.z*nz.y, uy = ax.z*nz.x - ax.x*nz.z, uz = ax.x*nz.y - ax.y*nz.x;
        const ul = Math.sqrt(ux*ux + uy*uy + uz*uz) || 1;
        ux /= ul; uy /= ul; uz /= ul;
        // v = nz cross u
        const vx = nz.y*uz - nz.z*uy, vy = nz.z*ux - nz.x*uz, vz = nz.x*uy - nz.y*ux;
        const pts = [];
        const n = 36;
        for (let i = 0; i <= n; i++) {
          const theta = 2*Math.PI*i/n;
          const co = Math.cos(theta), si = Math.sin(theta);
          pts.push(projectTriple(makeTriple(
            center.x + r*(co*ux + si*vx),
            center.y + r*(co*uy + si*vy),
            center.z + r*(co*uz + si*vz)
          )));
        }
        const segs = [];
        for (let i = 0; i < pts.length - 1; i++) segs.push(lineSegment(pts[i], pts[i+1]));
        return makePath(segs, true);
      }
      // Fallback to 2D circle (handled by existing builtin)
      const c = toPair(args[0]), r2 = toNumber(args[1]);
      const pts2 = [];
      const n2 = 36;
      for (let i = 0; i <= n2; i++) {
        const theta2 = 2*Math.PI*i/n2;
        pts2.push(makePair(c.x + r2*Math.cos(theta2), c.y + r2*Math.sin(theta2)));
      }
      const segs2 = [];
      for (let i = 0; i < pts2.length - 1; i++) segs2.push(lineSegment(pts2[i], pts2[i+1]));
      return makePath(segs2, true);
    });

    // shift for triples
    const origShift = env.get('shift');
    env.set('shift', (...args) => {
      if (args.length === 1 && isTriple(args[0])) {
        const d = args[0];
        return {_tag:'transform', a:d.x, b:1, c:d.y, d:0, e:d.z, f:1, _shift3d:d};
      }
      if (args.length === 3 && typeof args[0] === 'number') {
        const d = makeTriple(args[0], args[1], args[2]);
        return {_tag:'transform', a:d.x, b:1, c:d.y, d:0, e:d.z, f:1, _shift3d:d};
      }
      if (origShift) return origShift(...args);
      if (args.length === 2) return makeTransform(args[0], 1, args[1], 0, 0, 1);
      if (args.length === 1 && isPair(args[0])) return makeTransform(args[0].x, 1, args[0].y, 0, 0, 1);
      return makeTransform(0,1,0,0,0,1);
    });

    // 3D scale
    const origScale = env.get('scale');
    env.set('scale', (...args) => {
      if (args.length === 3) {
        // scale(sx, sy, sz) - 3D scale, return as transform with metadata
        return {_tag:'transform', a:0, b:args[0], c:0, d:0, e:0, f:args[1], _scale3d:{x:args[0],y:args[1],z:args[2]}};
      }
      if (origScale) return origScale(...args);
      const s = toNumber(args[0]);
      return makeTransform(0, s, 0, 0, 0, s);
    });

    // Sin/Cos (degree-based trig)
    env.set('Sin', (deg) => Math.sin(toNumber(deg) * Math.PI / 180));
    env.set('Cos', (deg) => Math.cos(toNumber(deg) * Math.PI / 180));
    env.set('Tan', (deg) => Math.tan(toNumber(deg) * Math.PI / 180));

    // (intersectionpoints defined earlier with proper implementation)

    // surface/revolution stubs for non-wireframe usage (draw calls on these are no-ops)
    env.set('surface', (...args) => ({_tag:'surface'}));
    env.set('revolution', (...args) => ({_tag:'surface'}));
    env.set('unitsphere', {_tag:'surface'});
    env.set('unitdisk', {_tag:'surface'});
    env.set('unitplane', {_tag:'surface'});
    env.set('unitcube', {_tag:'surface'});
    env.set('extrude', (...args) => ({_tag:'surface'}));

    // light stubs
    env.set('light', (...args) => ({_tag:'light'}));
    env.set('currentlight', {_tag:'light'});
    env.set('nolight', {_tag:'light'});
    env.set('Headlamp', {_tag:'light'});
    env.set('White', {_tag:'light'});

    // material stubs
    env.set('material', (...args) => isPen(args[0]) ? args[0] : makePen({}));
    env.set('emissive', (p) => isPen(p) ? p : makePen({}));
  }

  // Draw command evaluators
  function evalDraw(cmd, args) {
    if (args.length === 0) return;
    // Extract target picture if first arg is a picture
    let target = currentPic;
    if (args.length > 0 && args[0] && args[0]._tag === 'picture') {
      target = args[0];
      args = args.slice(1);
    }
    // Detect draw(pair, path, pen) marker syntax: shift path to pair position
    if (args.length >= 2 && isPair(args[0]) && isPath(args[1]) && args[1].segs && args[1].segs.length > 0) {
      const pos = args[0];
      const shiftT = makeTransform(pos.x, 1, 0, pos.y, 0, 1);
      args = [applyTransformPath(shiftT, args[1]), ...args.slice(2)];
    }
    let pathArg = null, pen = null, drawPen = null, arrow = null;
    let penCount = 0;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === null || a === undefined) continue;
      if (isPath(a)) { if (!pathArg) pathArg = a; }
      else if (isPen(a)) {
        penCount++;
        if (cmd === 'filldraw' && penCount === 2) { drawPen = a; }
        else { pen = pen ? mergePens(pen, a) : a; }
      }
      else if (a && a._tag === 'arrow') arrow = a;
      else if (typeof a === 'function' && !arrow) {
        try { const r = a(); if (r && r._tag === 'arrow') arrow = r; } catch(e) {}
      }
      else if (isTriple(a) && !pathArg) {
        pathArg = makePath([], false);
        pathArg._singlePoint = projectTriple(a);
      }
      else if (isPair(a) && !pathArg) {
        pathArg = makePath([], false);
        pathArg._singlePoint = a;
      }
    }
    if (!pathArg && args.length > 0) {
      const first = args[0];
      if (isTriple(first)) {
        pathArg = makePath([], false);
        pathArg._singlePoint = projectTriple(first);
      } else if (isPair(first)) {
        pathArg = makePath([], false);
        pathArg._singlePoint = first;
      }
    }
    if (!pen) pen = clonePen(defaultPen);
    // filldraw with one pen: fill with that pen, stroke with default pen (black)
    if (cmd === 'filldraw' && !drawPen) drawPen = clonePen(defaultPen);
    if (pathArg) {
      projectPathTriples(pathArg);
      const dc = {cmd, path:pathArg, pen, arrow, line: args._line || 0};
      if (drawPen) dc.drawPen = drawPen;
      target.commands.push(dc);
    }
  }

  function evalDot(args) {
    if (args.length === 0) return;
    // Extract target picture if first arg is a picture
    let target = currentPic;
    if (args.length > 0 && args[0] && args[0]._tag === 'picture') {
      target = args[0];
      args = args.slice(1);
    }
    let pos = null, pen = null, text = null, align = null, multiDots = null;
    for (const a of args) {
      if (isTriple(a)) {
        if (!pos) pos = projectTriple(a);
        else if (!align) align = projectTriple(a);
      }
      else if (isPair(a)) {
        if (!pos) pos = a;
        else if (!align) align = a;
      }
      else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
      else if (isPath(a) && a.segs.length > 0 && !pos) {
        // Multi-dot: dot all segment endpoints (for ^^ paths)
        const points = [a.segs[0].p0];
        for (const seg of a.segs) {
          const p3 = seg.p3;
          if (!points.some(p => Math.abs(p.x-p3.x)<1e-10 && Math.abs(p.y-p3.y)<1e-10))
            points.push(p3);
        }
        if (points.length > 1) { multiDots = points; } else { pos = points[0]; }
      }
      else if (isString(a) && text === null) text = a;
    }
    if (!pen) pen = clonePen(defaultPen);
    if (multiDots) {
      for (const pt of multiDots) {
        target.commands.push({cmd:'dot', pos:pt, pen, line: args._line || 0});
      }
      return;
    }
    if (!pos) return;
    target.commands.push({cmd:'dot', pos, pen, line: args._line || 0});
    // If dot has a label, add it too
    if (text) {
      if (!align) align = makePair(1, 1);
      target.commands.push({cmd:'label', text, pos, align, pen, line: args._line || 0});
    }
  }

  function evalLabel(args) {
    if (args.length === 0) return;
    // Extract target picture if first arg is a picture
    let target = currentPic;
    if (args.length > 0 && args[0] && args[0]._tag === 'picture') {
      target = args[0];
      args = args.slice(1);
    }
    let text = '', pos = null, align = null, pen = null, filltype = null, labelTransform = null;
    for (const a of args) {
      if (a && a._tag === 'label') {
        if (!text) text = a.text || '';
        if (!align && a.align) align = a.align;
        if (!filltype && a.filltype) filltype = a.filltype;
        if (!labelTransform && a.transform) labelTransform = a.transform;
      }
      else if (a && a._tag === 'filltype') { filltype = a; }
      else if (isString(a) && !text) text = a;
      else if (isPath(a) && !pos) {
        // label on a path: place at midpoint
        const segs = a.segs;
        if (segs.length > 0) {
          const midSeg = segs[Math.floor(segs.length/2)];
          pos = makePair((midSeg.p0.x+midSeg.p3.x)/2, (midSeg.p0.y+midSeg.p3.y)/2);
        }
      }
      else if (isTriple(a)) {
        if (!pos) pos = projectTriple(a);
        else if (!align) align = projectTriple(a);
      }
      else if (isPair(a)) {
        if (!pos) pos = a;
        else if (!align) align = a;
      }
      else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
    }
    if (!pos) pos = makePair(0,0);
    if (!pen) pen = clonePen(defaultPen);
    const labelCmd = {cmd:'label', text, pos, align, pen, filltype, line: args._line || 0};
    if (labelTransform) labelCmd.labelTransform = labelTransform;
    target.commands.push(labelCmd);
  }

  // Path helpers
  function makeCirclePath(center, r) {
    const K = 0.5522847498;
    const cx = center.x, cy = center.y;
    return makePath([
      makeSeg({x:cx+r,y:cy},{x:cx+r,y:cy+K*r},{x:cx+K*r,y:cy+r},{x:cx,y:cy+r}),
      makeSeg({x:cx,y:cy+r},{x:cx-K*r,y:cy+r},{x:cx-r,y:cy+K*r},{x:cx-r,y:cy}),
      makeSeg({x:cx-r,y:cy},{x:cx-r,y:cy-K*r},{x:cx-K*r,y:cy-r},{x:cx,y:cy-r}),
      makeSeg({x:cx,y:cy-r},{x:cx+K*r,y:cy-r},{x:cx+r,y:cy-K*r},{x:cx+r,y:cy}),
    ], true);
  }

  function makeArcPath(center, r, startDeg, endDeg) {
    const startRad = startDeg * Math.PI / 180;
    const endRad = endDeg * Math.PI / 180;
    let sweep = endRad - startRad;
    // Normalize to handle both directions
    const segs = [];
    const nSegs = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI/2)));
    const dAngle = sweep / nSegs;

    for (let i = 0; i < nSegs; i++) {
      const a1 = startRad + i * dAngle;
      const a2 = a1 + dAngle;
      const segResult = arcSegment(center, r, a1, a2);
      segs.push(segResult);
    }
    return makePath(segs, false);
  }

  function arcSegment(center, r, a1, a2) {
    const da = a2 - a1;
    const alpha = Math.sin(da) * (Math.sqrt(4 + 3*Math.pow(Math.tan(da/2),2)) - 1) / 3;
    const p0 = {x: center.x + r*Math.cos(a1), y: center.y + r*Math.sin(a1)};
    const p3 = {x: center.x + r*Math.cos(a2), y: center.y + r*Math.sin(a2)};
    const cp1 = {x: p0.x - alpha*r*Math.sin(a1), y: p0.y + alpha*r*Math.cos(a1)};
    const cp2 = {x: p3.x + alpha*r*Math.sin(a2), y: p3.y - alpha*r*Math.cos(a2)};
    return makeSeg(p0, cp1, cp2, p3);
  }

  // Project any remaining triples in path segments to pairs
  function projectPathTriples(p) {
    if (!isPath(p)) return p;
    for (const seg of p.segs) {
      if (isTriple(seg.p0)) { const pr = projectTriple(seg.p0); seg.p0 = pr; }
      if (isTriple(seg.cp1)) { const pr = projectTriple(seg.cp1); seg.cp1 = pr; }
      if (isTriple(seg.cp2)) { const pr = projectTriple(seg.cp2); seg.cp2 = pr; }
      if (isTriple(seg.p3)) { const pr = projectTriple(seg.p3); seg.p3 = pr; }
    }
    if (p._singlePoint && isTriple(p._singlePoint)) {
      p._singlePoint = projectTriple(p._singlePoint);
    }
    return p;
  }

  function bezierArcLength(seg) {
    // Approximate arc length by sampling
    let len = 0;
    const N = 16;
    let prev = seg.p0;
    for (let i = 1; i <= N; i++) {
      const t = i/N;
      const pt = bezierPoint(seg, t);
      len += Math.sqrt((pt.x-prev.x)*(pt.x-prev.x) + (pt.y-prev.y)*(pt.y-prev.y));
      prev = pt;
    }
    return len;
  }

  function bezierBezierIntersect(s1, s2) {
    // Recursive subdivision approach for robust Bezier-Bezier intersection
    function bbox(seg) {
      const xs = [seg.p0.x, seg.cp1.x, seg.cp2.x, seg.p3.x];
      const ys = [seg.p0.y, seg.cp1.y, seg.cp2.y, seg.p3.y];
      return {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
      };
    }
    function bboxOverlap(a, b, tol) {
      return a.minX - tol <= b.maxX && a.maxX + tol >= b.minX &&
             a.minY - tol <= b.maxY && a.maxY + tol >= b.minY;
    }
    function subdivide(seg, t) {
      const p0 = seg.p0, p1 = seg.cp1, p2 = seg.cp2, p3 = seg.p3;
      const u = 1 - t;
      const q0 = {x: u*p0.x + t*p1.x, y: u*p0.y + t*p1.y};
      const q1 = {x: u*p1.x + t*p2.x, y: u*p1.y + t*p2.y};
      const q2 = {x: u*p2.x + t*p3.x, y: u*p2.y + t*p3.y};
      const r0 = {x: u*q0.x + t*q1.x, y: u*q0.y + t*q1.y};
      const r1 = {x: u*q1.x + t*q2.x, y: u*q1.y + t*q2.y};
      const s0 = {x: u*r0.x + t*r1.x, y: u*r0.y + t*r1.y};
      return [
        makeSeg(p0, q0, r0, s0),
        makeSeg(s0, r1, q2, p3),
      ];
    }
    function segSize(seg) {
      const dx = seg.p3.x - seg.p0.x, dy = seg.p3.y - seg.p0.y;
      return Math.abs(dx) + Math.abs(dy);
    }
    const tol = 1e-4;
    const results = [];
    function recurse(a, b, depth) {
      if (results.length > 0) return; // only need first intersection
      const ba = bbox(a), bb = bbox(b);
      if (!bboxOverlap(ba, bb, tol)) return;
      if (depth > 40) {
        // Converged — report midpoint
        const mx = (a.p0.x + a.p3.x + b.p0.x + b.p3.x) / 4;
        const my = (a.p0.y + a.p3.y + b.p0.y + b.p3.y) / 4;
        results.push(makePair(mx, my));
        return;
      }
      if (segSize(a) < tol && segSize(b) < tol) {
        const mx = (a.p0.x + b.p0.x) / 2;
        const my = (a.p0.y + b.p0.y) / 2;
        results.push(makePair(mx, my));
        return;
      }
      // Subdivide the larger segment
      if (segSize(a) >= segSize(b)) {
        const [a1, a2] = subdivide(a, 0.5);
        recurse(a1, b, depth + 1);
        recurse(a2, b, depth + 1);
      } else {
        const [b1, b2] = subdivide(b, 0.5);
        recurse(a, b1, depth + 1);
        recurse(a, b2, depth + 1);
      }
    }
    recurse(s1, s2, 0);
    return results.length > 0 ? results[0] : null;
  }

  function bezierBezierAllIntersections(s1, s2) {
    // Find ALL intersections between two Bezier segments
    function bbox(seg) {
      const xs = [seg.p0.x, seg.cp1.x, seg.cp2.x, seg.p3.x];
      const ys = [seg.p0.y, seg.cp1.y, seg.cp2.y, seg.p3.y];
      return {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
      };
    }
    function bboxOverlap(a, b, tol) {
      return a.minX - tol <= b.maxX && a.maxX + tol >= b.minX &&
             a.minY - tol <= b.maxY && a.maxY + tol >= b.minY;
    }
    function subdivide(seg, t) {
      const p0 = seg.p0, p1 = seg.cp1, p2 = seg.cp2, p3 = seg.p3;
      const u = 1 - t;
      const q0 = {x: u*p0.x + t*p1.x, y: u*p0.y + t*p1.y};
      const q1 = {x: u*p1.x + t*p2.x, y: u*p1.y + t*p2.y};
      const q2 = {x: u*p2.x + t*p3.x, y: u*p2.y + t*p3.y};
      const r0 = {x: u*q0.x + t*q1.x, y: u*q0.y + t*q1.y};
      const r1 = {x: u*q1.x + t*q2.x, y: u*q1.y + t*q2.y};
      const s0 = {x: u*r0.x + t*r1.x, y: u*r0.y + t*r1.y};
      return [
        makeSeg(p0, q0, r0, s0),
        makeSeg(s0, r1, q2, p3),
      ];
    }
    function segSize(seg) {
      const dx = seg.p3.x - seg.p0.x, dy = seg.p3.y - seg.p0.y;
      return Math.abs(dx) + Math.abs(dy);
    }
    const tol = 1e-4;
    const results = [];
    function recurse(a, b, depth) {
      const ba = bbox(a), bb = bbox(b);
      if (!bboxOverlap(ba, bb, tol)) return;
      if (depth > 40 || (segSize(a) < tol && segSize(b) < tol)) {
        const mx = (a.p0.x + a.p3.x + b.p0.x + b.p3.x) / 4;
        const my = (a.p0.y + a.p3.y + b.p0.y + b.p3.y) / 4;
        // Deduplicate: skip if too close to existing result
        for (const r of results) {
          if (Math.abs(r.x - mx) < 0.001 && Math.abs(r.y - my) < 0.001) return;
        }
        results.push(makePair(mx, my));
        return;
      }
      if (segSize(a) >= segSize(b)) {
        const [a1, a2] = subdivide(a, 0.5);
        recurse(a1, b, depth + 1);
        recurse(a2, b, depth + 1);
      } else {
        const [b1, b2] = subdivide(b, 0.5);
        recurse(a, b1, depth + 1);
        recurse(a, b2, depth + 1);
      }
    }
    recurse(s1, s2, 0);
    return results;
  }

  // Main execution
  function execute(code) {
    // Reset state
    drawCommands.length = 0;
    currentPic = {_tag:'picture', commands:[]};
    globalEnv.update('currentpicture', currentPic);
    projection = null;
    unitScale = 1; hasUnitScale = false;
    sizeW = 0; sizeH = 0;
    defaultPen = makePen({});
    _axisLimits = { xmin: null, xmax: null, ymin: null, ymax: null, crop: false };

    // Auto-install graph package — many AoPS codes use graph functions without import
    graphPackageInstalled = false; // Reset so it re-installs with fresh state
    installGraphPackage(globalEnv);

    const tokens = lex(code);
    const ast = parse(tokens);

    // Walk AST and track source lines for draw commands
    patchDrawLines(ast, globalEnv);

    evalNode(ast, globalEnv);

    // Copy currentpicture's commands to drawCommands for rendering
    for (const c of currentPic.commands) drawCommands.push(c);

    // Read dotfactor from environment (default 6)
    const dotfactorVal = globalEnv.get('dotfactor');
    const dotfactor = (typeof dotfactorVal === 'number' && dotfactorVal > 0) ? dotfactorVal : 6;

    return {
      drawCommands: drawCommands.slice(),
      unitScale, hasUnitScale,
      sizeW, sizeH,
      defaultPen,
      axisLimits: Object.assign({}, _axisLimits),
      dotfactor,
    };
  }

  // Patch: pass source line info to draw/label/dot calls
  function patchDrawLines(ast, env) {
    // Walk AST and wrap draw calls so they carry line info
    walkAST(ast, (node) => {
      if (node.type === 'ExprStmt' && node.expr && node.expr.type === 'FuncCall') {
        node.expr._sourceLine = node.line || node.expr.line;
      }
      if (node.type === 'FuncCall') {
        node._sourceLine = node.line;
      }
    });
  }

  function walkAST(node, fn) {
    if (!node || typeof node !== 'object') return;
    fn(node);
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach(c => walkAST(c, fn));
      else if (v && typeof v === 'object' && v.type) walkAST(v, fn);
    }
  }

  return { execute, drawCommands };
}

// ============================================================
// SVG Renderer
// ============================================================

function renderSVG(result, opts) {
  opts = opts || {};
  const { drawCommands, unitScale, hasUnitScale, sizeW: _sizeW, sizeH: _sizeH, axisLimits, dotfactor: _dotfactor } = result;
  let sizeW = _sizeW, sizeH = _sizeH;
  const dotfactor = _dotfactor || 6;
  if (drawCommands.length === 0) return { svg:'<svg xmlns="http://www.w3.org/2000/svg"></svg>', commandMap: [], warnings: [] };

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function expandBBox(x, y) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function expandBezierBBox(seg) {
    // Include endpoints and control points, plus Bezier extrema
    for (const p of [seg.p0, seg.cp1, seg.cp2, seg.p3]) expandBBox(p.x, p.y);
    // Find extrema in x and y
    for (let dim = 0; dim < 2; dim++) {
      const key = dim === 0 ? 'x' : 'y';
      const p0 = seg.p0[key], p1 = seg.cp1[key], p2 = seg.cp2[key], p3 = seg.p3[key];
      const a = -3*p0+9*p1-9*p2+3*p3, b = 6*p0-12*p1+6*p2, c = 3*p1-3*p0;
      if (Math.abs(a) > 1e-12) {
        const disc = b*b-4*a*c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          for (const t of [(-b+sq)/(2*a), (-b-sq)/(2*a)]) {
            if (t > 0 && t < 1) {
              const u=1-t;
              expandBBox(
                dim===0 ? u*u*u*p0+3*u*u*t*seg.cp1.x+3*u*t*t*seg.cp2.x+t*t*t*p3 : minX,
                dim===1 ? u*u*u*p0+3*u*u*t*seg.cp1.y+3*u*t*t*seg.cp2.y+t*t*t*p3 : minY
              );
              // Actually compute properly
              const val = u*u*u*seg.p0[key]+3*u*u*t*seg.cp1[key]+3*u*t*t*seg.cp2[key]+t*t*t*seg.p3[key];
              if (dim===0) { if(val<minX)minX=val; if(val>maxX)maxX=val; }
              else { if(val<minY)minY=val; if(val>maxY)maxY=val; }
            }
          }
        }
      } else if (Math.abs(b) > 1e-12) {
        const t = -c/b;
        if (t > 0 && t < 1) {
          const u=1-t;
          const val = u*u*u*seg.p0[key]+3*u*u*t*seg.cp1[key]+3*u*t*t*seg.cp2[key]+t*t*t*seg.p3[key];
          if (dim===0) { if(val<minX)minX=val; if(val>maxX)maxX=val; }
          else { if(val<minY)minY=val; if(val>maxY)maxY=val; }
        }
      }
    }
  }

  // Compute bounding box from all draw commands
  for (const dc of drawCommands) {
    if (dc.cmd === 'dot') {
      expandBBox(dc.pos.x, dc.pos.y);
    } else if (dc.cmd === 'label') {
      expandBBox(dc.pos.x, dc.pos.y);
      // Estimate text extent in user coordinates for bbox expansion
      // We don't know pxPerUnit yet, so approximate with a fraction of bbox size
      // This will be refined after pxPerUnit is computed below
    } else if (dc.path) {
      if (dc.path._singlePoint) {
        expandBBox(dc.path._singlePoint.x, dc.path._singlePoint.y);
      }
      for (const seg of dc.path.segs) expandBezierBBox(seg);
    }
  }

  // When Crop is enabled, constrain bbox to axis limits (plus padding for labels/axes)
  if (axisLimits && axisLimits.crop &&
      axisLimits.xmin !== null && axisLimits.xmax !== null &&
      axisLimits.ymin !== null && axisLimits.ymax !== null) {
    // Allow a small margin beyond limits for axis labels/ticks
    const xMargin = (axisLimits.xmax - axisLimits.xmin) * 0.15;
    const yMargin = (axisLimits.ymax - axisLimits.ymin) * 0.15;
    minX = Math.max(minX, axisLimits.xmin - xMargin);
    maxX = Math.min(maxX, axisLimits.xmax + xMargin);
    minY = Math.max(minY, axisLimits.ymin - yMargin);
    maxY = Math.min(maxY, axisLimits.ymax + yMargin);
  }

  // Add padding
  if (!isFinite(minX)) { minX=0; minY=0; maxX=1; maxY=1; }
  const pad = 0.5;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  // Expand bbox for labels so text doesn't get clipped
  // Estimate label extent in user coordinates
  for (const dc of drawCommands) {
    if (dc.cmd === 'label' || dc.cmd === 'dot') {
      const pos = dc.pos || dc;
      if (!pos || pos.x === undefined) continue;
      const fontSize = (dc.pen && dc.pen.fontsize) || 10;
      const text = dc.text || dc.label || '';
      const cleanText = typeof text === 'string' ? stripLaTeX(text) : '';
      // Approximate character width ~0.6 * fontSize
      const bboxSpan = maxX - minX || 1;
      // Rough pxPerUnit estimate for sizing
      const roughPxPerUnit = (sizeW > 0 ? sizeW : (sizeH > 0 ? sizeH : 340)) / bboxSpan;
      const charWidthUser = fontSize * 0.6 / roughPxPerUnit;
      // For labels with fractions, estimate wider width
      const rawLabel = text;
      const hasFrac = /\\frac/.test(rawLabel);
      const effectiveLen = hasFrac ? cleanText.length * 1.6 : cleanText.length;
      const textWidthUser = effectiveLen * charWidthUser;
      const textHeightUser = (hasFrac ? fontSize * 1.5 : fontSize) / roughPxPerUnit;
      let dx = 0, dy = 0;
      if (dc.align) {
        dx = dc.align.x * textHeightUser * 0.8;
        dy = dc.align.y * textHeightUser * 0.8;
      }
      // Expand bbox to include estimated text bounds
      const cx = pos.x + dx;
      const cy = pos.y + dy;
      expandBBox(cx - textWidthUser/2, cy - textHeightUser/2);
      expandBBox(cx + textWidthUser/2, cy + textHeightUser/2);
    }
  }

  const warnings = [];

  // Determine scale
  const bboxW = maxX - minX, bboxH = maxY - minY;
  let pxPerUnit;
  if (hasUnitScale) {
    // unitsize() was called: user coords → bp directly
    pxPerUnit = unitScale;
  } else if (sizeW > 0 || sizeH > 0) {
    // size() without unitsize(): scale user coords to fit in the requested size
    const targetW = sizeW > 0 ? sizeW : Infinity;
    const targetH = sizeH > 0 ? sizeH : Infinity;
    pxPerUnit = Math.min(targetW / bboxW, targetH / bboxH);
  } else {
    // No unitsize/size: mimic AoPS TeXeR behavior (equivalent to size(200))
    const defaultSize = 200;
    const targetW = defaultSize;
    const targetH = defaultSize;
    pxPerUnit = Math.min(targetW / (bboxW || 1), targetH / (bboxH || 1));
    sizeW = defaultSize;
    sizeH = defaultSize;
    warnings.push('auto-scaled');
  }

  const naturalW = (maxX - minX) * pxPerUnit;
  const naturalH = (maxY - minY) * pxPerUnit;

  // Apply explicit size() if given
  let svgW = naturalW, svgH = naturalH;
  if (sizeW > 0) svgW = sizeW;
  if (sizeH > 0) svgH = sizeH;

  // Enforce minimum display size (like AoPS TeXeR) for very small unitsize values
  const minDisplaySize = 100;
  if (svgW < minDisplaySize && svgH < minDisplaySize && hasUnitScale) {
    const upscale = minDisplaySize / Math.max(svgW, svgH);
    svgW *= upscale;
    svgH *= upscale;
  }

  // If container dimensions provided, shrink to fit
  let displayPercent = 100;
  const containerW = opts.containerW || 0;
  const containerH = opts.containerH || 0;
  if (containerW > 0 && containerH > 0) {
    const scaleX = containerW / svgW;
    const scaleY = containerH / svgH;
    if (scaleX < 1 || scaleY < 1) {
      const shrink = Math.min(scaleX, scaleY);
      displayPercent = Math.round(shrink * 100);
      svgW *= shrink;
      svgH *= shrink;
      // We don't change pxPerUnit or viewBox — we just set SVG width/height
      // smaller and let the browser scale via viewBox
    }
  }

  // Compute viewBox (in intrinsic coordinates, before any display shrink)
  const viewW = naturalW;
  const viewH = naturalH;

  // Build SVG
  const commandMap = []; // maps draw command index → SVG element index
  const elements = [];
  const ns = 'http://www.w3.org/2000/svg';

  // Crop clipping: if limits() was called with Crop, add SVG clipPath
  let cropClipId = null;
  if (axisLimits && axisLimits.crop &&
      axisLimits.xmin !== null && axisLimits.xmax !== null &&
      axisLimits.ymin !== null && axisLimits.ymax !== null) {
    cropClipId = 'crop-clip';
    const cx1 = (axisLimits.xmin - minX) * pxPerUnit;
    const cy1 = (maxY - axisLimits.ymax) * pxPerUnit;
    const cw = (axisLimits.xmax - axisLimits.xmin) * pxPerUnit;
    const ch = (axisLimits.ymax - axisLimits.ymin) * pxPerUnit;
    elements.push(`<defs><clipPath id="${cropClipId}"><rect x="${fmt(cx1)}" y="${fmt(cy1)}" width="${fmt(cw)}" height="${fmt(ch)}"/></clipPath></defs>`);
  }

  // Scale factor: how many viewBox units = 1 CSS pixel
  // viewBox is in pxPerUnit-scaled coordinates, and SVG display width = svgW CSS pixels
  // So 1 CSS pixel = viewW / svgW viewBox units
  const cssPixel = viewW / (svgW || viewW || 1);

  // Render draw commands in two passes: first paths/fills/dots, then labels on top
  // This prevents fills drawn later in program order from covering earlier labels
  // Dots are rendered in program order (not deferred) to allow later fills to cover them
  const deferredLabels = []; // [{ci, dc}]

  function renderPathCommand(ci, dc, css, dashArray) {
    if (dc.path._singlePoint) {
      const p = dc.path._singlePoint;
      const sx = (p.x - minX) * pxPerUnit;
      const sy = (maxY - p.y) * pxPerUnit;
      // Asymptote: single-point draw = zero-length stroke, radius = linewidth/2 (no dotfactor)
      const singleDotLw = dc.pen ? dc.pen.linewidth : 0.5;
      const singleDotR = (singleDotLw / 2) * cssPixel;
      elements.push(`<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(singleDotR)}" fill="${css.fill}" stroke="none"${opacityAttr(css.opacity)}/>`);
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
      return;
    }
    if (dc.path.segs.length === 0) return;

    const d = pathToD(dc.path, minX, maxY, pxPerUnit);
    let fill = 'none', stroke = 'none', strokeW = 0;

    if (dc.cmd === 'fill' || dc.cmd === 'unfill') {
      fill = dc.cmd === 'unfill' ? '#ffffff' : css.fill;
    } else if (dc.cmd === 'filldraw') {
      fill = css.fill;
      if (dc.drawPen) {
        const drawCSS = penToCSS(dc.drawPen);
        drawCSS.strokeWidth *= cssPixel;
        stroke = drawCSS.stroke;
        strokeW = drawCSS.strokeWidth;
      } else {
        stroke = css.stroke;
        strokeW = css.strokeWidth;
      }
    } else if (dc.cmd === 'clip') {
      return; // skip clip for now
    } else {
      // draw
      stroke = css.stroke;
      strokeW = css.strokeWidth;
    }

    let attrs = `d="${d}"`;
    attrs += ` fill="${fill}"`;
    if (stroke !== 'none') {
      attrs += ` stroke="${stroke}" stroke-width="${fmt(strokeW)}"`;
      if (dashArray) attrs += ` stroke-dasharray="${dashArray}"`;
      if (dc.pen && dc.pen.linecap) attrs += ` stroke-linecap="${dc.pen.linecap}"`;
      if (dc.pen && dc.pen.linejoin) attrs += ` stroke-linejoin="${dc.pen.linejoin}"`;
    }
    attrs += opacityAttr(css.opacity);

    elements.push(`<path ${attrs}/>`);
    commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});

    // Arrow heads
    if (dc.arrow && dc.cmd === 'draw') {
      const arrowEl = generateArrowHead(dc, minX, maxY, pxPerUnit, cssPixel, css);
      if (arrowEl) {
        elements.push(arrowEl);
        commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
      }
    }
  }

  // Pass 1: paths, fills, draws, and dots (in program order)
  for (let ci = 0; ci < drawCommands.length; ci++) {
    const dc = drawCommands[ci];
    const css = penToCSS(dc.pen);
    css.strokeWidth *= cssPixel;
    const dashArray = linestyleToDasharray(dc.pen ? dc.pen.linestyle : null, css.strokeWidth);

    if (dc.cmd === 'label') {
      deferredLabels.push({ci, dc, css: {...css}});
    } else if (dc.cmd === 'dot') {
      // Render dots in program order so later fills can cover them
      const sx = (dc.pos.x - minX) * pxPerUnit;
      const sy = (maxY - dc.pos.y) * pxPerUnit;
      // Dot radius: if linewidth was explicitly set by user (n+pen or linewidth(n)),
      // Asymptote uses radius = linewidth/2 directly (the number IS the dot size).
      // If linewidth is default (no explicit set), apply dotfactor: radius = dotfactor/2 * linewidth.
      const dotLw = dc.pen.linewidth;
      const dotR = (dc.pen._lwExplicit ? 0.5 : dotfactor / 2) * dotLw * cssPixel;
      elements.push(`<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(dotR)}" fill="${css.fill}" stroke="none"${opacityAttr(css.opacity)}/>`);
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
    } else if (dc.path) {
      renderPathCommand(ci, dc, css, dashArray);
    }
  }

  // Pass 2: labels on top (text always above graphics)
  for (const {ci, dc, css} of deferredLabels) {
    if (dc.cmd === 'label') {
      const sx = (dc.pos.x - minX) * pxPerUnit;
      const sy = (maxY - dc.pos.y) * pxPerUnit;
      const fontSize = (dc.pen.fontsize || 10) * cssPixel;
      let dx = 0, dy = 0;
      let anchor = 'middle';
      let baseline = 'central';
      if (dc.align) {
        const ax = dc.align.x, ay = dc.align.y;
        // Horizontal alignment: shift and anchor
        if (ax > 0.3) { anchor = 'start'; dx = fontSize * 0.3; }
        else if (ax < -0.3) { anchor = 'end'; dx = -fontSize * 0.3; }
        // Vertical alignment: shift (SVG y is inverted)
        if (ay > 0.3) { dy = -fontSize * 0.6; }
        else if (ay < -0.3) { dy = fontSize * 0.6; }
      }
      const rawText = dc.text || '';

      // If filltype is Fill, UnFill, or FillDraw — add a white background rectangle
      const ft = dc.filltype;
      if (ft && ft._tag === 'filltype' && (ft.style === 'Fill' || ft.style === 'UnFill' || ft.style === 'FillDraw')) {
        const bgPen = ft.pen || {r:1,g:1,b:1};
        const bgHex = '#' + [bgPen.r,bgPen.g,bgPen.b].map(c => {
          const h = Math.round(Math.max(0,Math.min(255,c*255))).toString(16);
          return h.length<2?'0'+h:h;
        }).join('');
        // Estimate text dimensions for background (tight fit like Asymptote)
        const cleanLen = stripLaTeX(rawText).length;
        const estW = cleanLen * fontSize * 0.52 + fontSize * 0.1;
        const estH = fontSize * 1.0;
        let rx = parseFloat(fmt(sx + dx)), ry = parseFloat(fmt(sy + dy));
        // Adjust rectangle position based on anchor
        let rectX = rx - estW / 2;
        if (anchor === 'start') rectX = rx - fontSize * 0.05;
        else if (anchor === 'end') rectX = rx - estW + fontSize * 0.05;
        const rectY = ry - estH / 2;
        const pad = fontSize * 0.04;
        elements.push(`<rect x="${fmt(rectX - pad)}" y="${fmt(rectY - pad)}" width="${fmt(estW + 2*pad)}" height="${fmt(estH + 2*pad)}" fill="${bgHex}" stroke="none"/>`);
      }

      // Apply label transform (scale/rotate) if present
      let effectiveFontSize = fontSize;
      let labelTransformAttr = '';
      if (dc.labelTransform) {
        const lt = dc.labelTransform;
        // Extract scale from transform matrix: scale = sqrt(b^2 + e^2) (x-axis scale)
        const scaleX = Math.sqrt(lt.b * lt.b + lt.e * lt.e);
        if (scaleX > 0 && Math.abs(scaleX - 1) > 0.01) effectiveFontSize = fontSize * scaleX;
        // Extract rotation angle from transform matrix
        const angle = Math.atan2(lt.e, lt.b) * 180 / Math.PI;
        if (Math.abs(angle) > 0.1) {
          // SVG rotation is clockwise, Asymptote is counterclockwise; SVG y is flipped
          labelTransformAttr = ` transform="rotate(${fmt(-angle)}, ${fmt(sx+dx)}, ${fmt(sy+dy)})"`;
        }
      }

      const hasLaTeX = /\\(frac|underbrace|overbrace|sqrt)\b/.test(rawText);
      const hasMath = /\$/.test(rawText) || /\\[a-zA-Z]/.test(rawText);
      let labelEl;
      if (typeof katex !== 'undefined' && hasMath) {
        // Use KaTeX for math rendering via foreignObject
        labelEl = renderLabelKaTeX(rawText, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity);
      } else if (hasLaTeX) {
        // Render complex LaTeX as SVG group with fractions/braces
        labelEl = renderLaTeXSVG(rawText, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, css.opacity);
      } else {
        // Render with superscript/subscript support using tspan
        labelEl = renderLabelWithScripts(rawText, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity);
      }
      if (labelTransformAttr) {
        labelEl = `<g${labelTransformAttr}>${labelEl}</g>`;
      }
      elements.push(labelEl);
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
    }
  }

  // If crop clipping is active, wrap drawing elements (not <defs>) in a <g clip-path>
  let innerContent;
  if (cropClipId) {
    const defsEl = elements.length > 0 && elements[0].startsWith('<defs>') ? elements[0] : null;
    const drawEls = defsEl ? elements.slice(1) : elements;
    innerContent = (defsEl ? defsEl + '\n' : '') + `<g clip-path="url(#${cropClipId})">\n${drawEls.join('\n')}\n</g>`;
  } else {
    innerContent = elements.join('\n');
  }
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(svgW)}" height="${fmt(svgH)}" viewBox="0 0 ${fmt(viewW)} ${fmt(viewH)}" overflow="visible">\n${innerContent}\n</svg>`;

  return { svg: svgContent, commandMap, pxPerUnit, minX, minY, maxX, maxY, warnings, displayPercent };
}

function pathToD(path, minX, maxY, scale) {
  const segs = path.segs;
  if (segs.length === 0) return '';
  let d = '';
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const p0x = (s.p0.x - minX)*scale, p0y = (maxY - s.p0.y)*scale;
    const cp1x = (s.cp1.x - minX)*scale, cp1y = (maxY - s.cp1.y)*scale;
    const cp2x = (s.cp2.x - minX)*scale, cp2y = (maxY - s.cp2.y)*scale;
    const p3x = (s.p3.x - minX)*scale, p3y = (maxY - s.p3.y)*scale;

    // Emit M at start or when there's a gap (^^ path concatenation)
    if (i === 0) {
      d += `M${fmt(p0x)} ${fmt(p0y)}`;
    } else {
      const prev = segs[i-1];
      const gap = Math.abs(s.p0.x - prev.p3.x) + Math.abs(s.p0.y - prev.p3.y);
      if (gap > 1e-9) d += ` M${fmt(p0x)} ${fmt(p0y)}`;
    }
    // Check if it's basically a line
    if (isLinear(s)) {
      d += ` L${fmt(p3x)} ${fmt(p3y)}`;
    } else {
      d += ` C${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(p3x)} ${fmt(p3y)}`;
    }
  }
  if (path.closed) d += ' Z';
  return d;
}

function isLinear(seg) {
  // Check if control points are on the line between endpoints
  const dx = seg.p3.x-seg.p0.x, dy = seg.p3.y-seg.p0.y;
  const d = Math.sqrt(dx*dx+dy*dy);
  if (d < 1e-12) return true;
  for (const cp of [seg.cp1, seg.cp2]) {
    const t = ((cp.x-seg.p0.x)*dx+(cp.y-seg.p0.y)*dy)/(d*d);
    const px = seg.p0.x+t*dx, py = seg.p0.y+t*dy;
    const dist = Math.sqrt((cp.x-px)*(cp.x-px)+(cp.y-py)*(cp.y-py));
    if (dist > 0.01) return false;
  }
  return true;
}

function linestyleToDasharray(style, strokeWidth) {
  if (!style || style === 'solid') return null;
  const w = strokeWidth || 0.5;
  switch(style) {
    case 'dashed': return `${6*w} ${4*w}`;
    case 'dotted': return `${1*w} ${3*w}`;
    case 'longdashed': return `${12*w} ${6*w}`;
    case 'dashdotted': return `${6*w} ${3*w} ${1*w} ${3*w}`;
    case 'longdashdotted': return `${12*w} ${4*w} ${1*w} ${4*w}`;
    default:
      // Custom dash pattern from linetype("a b c ...") — space-separated numbers
      if (/^[\d.\s]+$/.test(style)) {
        const nums = style.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
        if (nums.length > 0) {
          return nums.map(n => n * w * 4).join(' ');
        }
      }
      return null;
  }
}

function generateArrowHead(dc, minX, maxY, scale, cssPixel, css) {
  const path = dc.path;
  const style = dc.arrow.style;
  // Arrow size in CSS pixels: base size (default 6bp) scaled by cssPixel to viewBox units
  const baseSize = dc.arrow.size || 6;
  let arrowLen = baseSize * cssPixel;

  // Get endpoint and tangent direction
  let segs = path.segs;
  if (segs.length === 0) return null;

  // Compute total path length in viewBox units and clamp arrowhead size
  let totalLen = 0;
  for (const s of segs) {
    const dx = (s.p3.x - s.p0.x) * scale, dy = (s.p3.y - s.p0.y) * scale;
    totalLen += Math.sqrt(dx*dx + dy*dy);
  }
  // Don't let arrowhead exceed 70% of path length
  if (arrowLen > totalLen * 0.7) arrowLen = totalLen * 0.7;

  const arrowParts = [];
  const filled = (style !== 'Bar' && style !== 'Bars');

  function arrowAt(seg, atEnd) {
    let tip, tangentAngle;
    if (atEnd) {
      tip = seg.p3;
      const dx = seg.p3.x - seg.cp2.x, dy = seg.p3.y - seg.cp2.y;
      tangentAngle = Math.atan2(dy, dx);
      if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
        const ddx = seg.p3.x - seg.p0.x, ddy = seg.p3.y - seg.p0.y;
        tangentAngle = Math.atan2(ddy, ddx);
      }
    } else {
      tip = seg.p0;
      const dx = seg.p0.x - seg.cp1.x, dy = seg.p0.y - seg.cp1.y;
      tangentAngle = Math.atan2(dy, dx);
      if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
        const ddx = seg.p0.x - seg.p3.x, ddy = seg.p0.y - seg.p3.y;
        tangentAngle = Math.atan2(ddy, ddx);
      }
    }
    const tipX = (tip.x - minX)*scale, tipY = (maxY - tip.y)*scale;
    const headAngle = 30 * Math.PI / 180;
    // Arrow head in screen coordinates (Y is already flipped)
    const screenAngle = -tangentAngle; // flip Y for screen coords
    const s = arrowLen;
    const lx = tipX - s*Math.cos(screenAngle - headAngle);
    const ly = tipY - s*Math.sin(screenAngle - headAngle);
    const rx = tipX - s*Math.cos(screenAngle + headAngle);
    const ry = tipY - s*Math.sin(screenAngle + headAngle);
    return {d: `M${fmt(lx)} ${fmt(ly)} L${fmt(tipX)} ${fmt(tipY)} L${fmt(rx)} ${fmt(ry)}`, filled};
  }

  if (style === 'Arrow' || style === 'EndArrow' || style === 'ArcArrow') {
    arrowParts.push(arrowAt(segs[segs.length-1], true));
  } else if (style === 'BeginArrow') {
    arrowParts.push(arrowAt(segs[0], false));
  } else if (style === 'Arrows' || style === 'ArcArrows') {
    arrowParts.push(arrowAt(segs[segs.length-1], true));
    arrowParts.push(arrowAt(segs[0], false));
  } else if (style === 'MidArrow') {
    // Arrow at midpoint
    const midIdx = Math.floor(segs.length / 2);
    if (midIdx < segs.length) arrowParts.push(arrowAt(segs[midIdx], true));
  } else if (style === 'Bar' || style === 'Bars') {
    // Bars are perpendicular marks, simplified as short lines
    return null;
  }

  if (arrowParts.length === 0) return null;
  const d = arrowParts.map(p => p.d).join(' ');
  const isFilled = arrowParts[0].filled;
  const fillAttr = isFilled ? css.stroke : 'none';
  return `<path d="${d}" fill="${fillAttr}" stroke="${css.stroke}" stroke-width="${fmt(css.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Render label text with superscript/subscript support as SVG
function renderLabelWithScripts(rawText, x, y, fontSize, fill, anchor, baseline, opacity) {
  // First apply LaTeX-to-Unicode mapping (same as stripLaTeX but preserving ^/_)
  let s = rawText || '';
  s = s.replace(/\$/g, '');
  // Handle \mathbf, \mathrm, \textbf, etc. — remove the command, keep content
  s = s.replace(/\\(?:mathbf|mathrm|mathit|mathsf|mathtt|textbf|textit|textrm|text|operatorname)\s*\{([^}]*)\}/g, '$1');
  s = s.replace(/\\hspace\s*\{[^}]*\}/g, ' ');
  // Common LaTeX → Unicode
  const texMap = {
    '\\alpha':'α','\\beta':'β','\\gamma':'γ','\\delta':'δ','\\epsilon':'ε',
    '\\zeta':'ζ','\\eta':'η','\\theta':'θ','\\iota':'ι','\\kappa':'κ',
    '\\lambda':'λ','\\mu':'μ','\\nu':'ν','\\xi':'ξ','\\pi':'π',
    '\\rho':'ρ','\\sigma':'σ','\\tau':'τ','\\upsilon':'υ','\\phi':'φ',
    '\\chi':'χ','\\psi':'ψ','\\omega':'ω',
    '\\Gamma':'Γ','\\Delta':'Δ','\\Theta':'Θ','\\Lambda':'Λ','\\Xi':'Ξ',
    '\\Pi':'Π','\\Sigma':'Σ','\\Phi':'Φ','\\Psi':'Ψ','\\Omega':'Ω',
    '\\infty':'∞','\\pm':'±','\\mp':'∓','\\times':'×','\\div':'÷',
    '\\cdot':'·','\\cdots':'⋯','\\ldots':'…','\\vdots':'⋮','\\ddots':'⋱','\\dots':'…',
    '\\le':'≤','\\leq':'≤','\\ge':'≥','\\geq':'≥',
    '\\neq':'≠','\\approx':'≈','\\equiv':'≡',
    '\\in':'∈','\\notin':'∉','\\subset':'⊂','\\supset':'⊃',
    '\\cup':'∪','\\cap':'∩','\\forall':'∀','\\exists':'∃','\\neg':'¬',
    '\\wedge':'∧','\\vee':'∨','\\oplus':'⊕','\\otimes':'⊗',
    '\\rightarrow':'→','\\leftarrow':'←','\\Rightarrow':'⇒','\\Leftarrow':'⇐',
    '\\leftrightarrow':'↔','\\triangle':'△','\\angle':'∠','\\perp':'⊥',
    '\\parallel':'∥','\\circ':'∘','\\bullet':'•','\\star':'★','\\dagger':'†',
    '\\ell':'ℓ','\\prime':'′',
    '\\cos':'cos','\\sin':'sin','\\tan':'tan','\\log':'log','\\ln':'ln',
    '\\left':'','\\right':'',
  };
  const sortedEntries = Object.entries(texMap).sort((a,b) => b[0].length - a[0].length);
  for (const [cmd, uni] of sortedEntries) s = s.split(cmd).join(uni);
  // Remove remaining \commands
  s = s.replace(/\\[a-zA-Z]+/g, '');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\s+/g, ' ').trim();

  // Check for super/subscripts
  const hasSS = /[_^]/.test(s);
  if (!hasSS) {
    // Simple text, no scripts
    const op = opacity != null && opacity < 1 ? ` opacity="${opacity}"` : '';
    return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-family="serif"${op}>${escSvg(s)}</text>`;
  }

  // Parse into segments: normal text, superscript (^), subscript (_)
  const parts = []; // {text, mode:'normal'|'sup'|'sub'}
  let i = 0, cur = '', mode = 'normal';
  while (i < s.length) {
    if (s[i] === '^' || s[i] === '_') {
      if (cur) parts.push({text: cur, mode});
      mode = s[i] === '^' ? 'sup' : 'sub';
      i++;
      // Grab next char or braced group
      cur = '';
      if (i < s.length && s[i] === '{') {
        i++; // skip {
        let depth = 1;
        while (i < s.length && depth > 0) {
          if (s[i] === '{') depth++;
          else if (s[i] === '}') { depth--; if (depth === 0) { i++; break; } }
          cur += s[i]; i++;
        }
      } else if (i < s.length) {
        cur = s[i]; i++;
      }
      parts.push({text: cur, mode});
      cur = ''; mode = 'normal';
    } else {
      cur += s[i]; i++;
    }
  }
  if (cur) parts.push({text: cur, mode});

  // Build SVG text with tspan elements
  const op = opacity != null && opacity < 1 ? ` opacity="${opacity}"` : '';
  let inner = '';
  for (const p of parts) {
    if (p.mode === 'sup') {
      inner += `<tspan dy="${fmt(-fontSize * 0.35)}" font-size="${fmt(fontSize * 0.7)}">${escSvg(p.text)}</tspan><tspan dy="${fmt(fontSize * 0.35)}" font-size="${fmt(fontSize)}"></tspan>`;
    } else if (p.mode === 'sub') {
      inner += `<tspan dy="${fmt(fontSize * 0.25)}" font-size="${fmt(fontSize * 0.7)}">${escSvg(p.text)}</tspan><tspan dy="${fmt(-fontSize * 0.25)}" font-size="${fmt(fontSize)}"></tspan>`;
    } else {
      inner += escSvg(p.text);
    }
  }
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-family="serif"${op}>${inner}</text>`;
}

function renderLabelKaTeX(rawText, x, y, fontSize, fill, anchor, baseline, opacity) {
  // Extract math content: strip $ delimiters, render via KaTeX
  let math = (rawText || '').trim();
  // Check if wrapped in $...$
  const isDollar = math.startsWith('$') && math.endsWith('$');
  if (isDollar) math = math.slice(1, -1);
  // Remove double $$ too
  if (math.startsWith('$') && math.endsWith('$')) math = math.slice(1, -1);

  let html;
  try {
    html = katex.renderToString(math, {throwOnError: false, displayMode: false, output: 'mathml'});
  } catch(e) {
    // Fallback to Unicode rendering
    return renderLabelWithScripts(rawText, x, y, fontSize, fill, anchor, baseline, opacity);
  }

  // Estimate dimensions for foreignObject
  const cleanLen = stripLaTeX(rawText).length;
  const estW = Math.max(cleanLen * fontSize * 0.7, fontSize * 2);
  const estH = fontSize * 1.8;

  // Compute foreignObject position based on anchor
  let fx = parseFloat(x), fy = parseFloat(y);
  if (anchor === 'middle') fx -= estW / 2;
  else if (anchor === 'end') fx -= estW;
  fy -= estH * 0.6; // vertically center

  const op = opacity != null && opacity < 1 ? ` opacity="${opacity}"` : '';
  const colorStyle = fill && fill !== '#000000' ? `color:${fill};` : '';
  return `<foreignObject x="${fmt(fx)}" y="${fmt(fy)}" width="${fmt(estW)}" height="${fmt(estH)}"${op}><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${fmt(fontSize)}px;${colorStyle}display:flex;align-items:center;justify-content:${anchor === 'end' ? 'flex-end' : anchor === 'start' ? 'flex-start' : 'center'};height:100%;overflow:visible;">${html}</div></foreignObject>`;
}

function stripLaTeX(text) {
  if (!text) return '';
  let s = text;
  // Remove $ delimiters
  s = s.replace(/\$/g, '');
  // Handle \frac{a}{b} → a/b (before removing braces)
  s = s.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '$1/$2');
  // Handle \underbrace{...} and \overbrace{...} → remove
  s = s.replace(/\\(?:underbrace|overbrace)\s*\{[^}]*\}/g, '');
  // Handle \hspace{...} → space
  s = s.replace(/\\hspace\s*\{[^}]*\}/g, ' ');
  // Handle \sqrt{a} → √a
  s = s.replace(/\\sqrt\s*\{([^}]*)\}/g, '√$1');
  // Common LaTeX commands → Unicode
  const texMap = {
    '\\alpha':'α','\\beta':'β','\\gamma':'γ','\\delta':'δ','\\epsilon':'ε',
    '\\zeta':'ζ','\\eta':'η','\\theta':'θ','\\iota':'ι','\\kappa':'κ',
    '\\lambda':'λ','\\mu':'μ','\\nu':'ν','\\xi':'ξ','\\pi':'π',
    '\\rho':'ρ','\\sigma':'σ','\\tau':'τ','\\upsilon':'υ','\\phi':'φ',
    '\\chi':'χ','\\psi':'ψ','\\omega':'ω',
    '\\Gamma':'Γ','\\Delta':'Δ','\\Theta':'Θ','\\Lambda':'Λ','\\Xi':'Ξ',
    '\\Pi':'Π','\\Sigma':'Σ','\\Phi':'Φ','\\Psi':'Ψ','\\Omega':'Ω',
    '\\infty':'∞','\\pm':'±','\\mp':'∓','\\times':'×','\\div':'÷',
    '\\cdot':'·','\\cdots':'⋯','\\ldots':'…','\\vdots':'⋮','\\ddots':'⋱','\\dots':'…',
    '\\le':'≤','\\leq':'≤','\\ge':'≥','\\geq':'≥',
    '\\neq':'≠','\\approx':'≈','\\equiv':'≡',
    '\\in':'∈','\\notin':'∉','\\subset':'⊂','\\supset':'⊃',
    '\\cup':'∪','\\cap':'∩','\\forall':'∀','\\exists':'∃','\\neg':'¬',
    '\\wedge':'∧','\\vee':'∨','\\oplus':'⊕','\\otimes':'⊗',
    '\\rightarrow':'→','\\leftarrow':'←','\\Rightarrow':'⇒','\\Leftarrow':'⇐',
    '\\leftrightarrow':'↔','\\triangle':'△','\\angle':'∠','\\perp':'⊥',
    '\\parallel':'∥','\\circ':'∘','\\bullet':'•','\\star':'★','\\dagger':'†',
    '\\ell':'ℓ', '\\prime':'′',
    '\\cos':'cos','\\sin':'sin','\\tan':'tan','\\log':'log','\\ln':'ln',
    '\\left':'','\\right':'',
  };
  // Sort by key length descending so longer commands match first (e.g. \left before \le)
  const sortedEntries = Object.entries(texMap).sort((a,b) => b[0].length - a[0].length);
  for (const [cmd, uni] of sortedEntries) {
    s = s.split(cmd).join(uni);
  }
  // Remove remaining \command sequences
  s = s.replace(/\\[a-zA-Z]+/g, '');
  // Remove braces
  s = s.replace(/[{}]/g, '');
  // Remove ^ and _ with single char
  s = s.replace(/[_^](.)/g, '$1');
  // Collapse multiple spaces and remove spaces adjacent to parentheses/brackets
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s+\(/g, '(');
  s = s.replace(/\(\s+/g, '(');
  s = s.replace(/\s+\)/g, ')');
  s = s.replace(/\[\s+/g, '[');
  s = s.replace(/\s+\]/g, ']');
  return s.trim();
}

// Estimate text width in SVG units using per-character width ratios for serif font
function _estimateTextWidth(text, fontSize) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // Space
    if (ch === ' ') w += 0.27;
    // Narrow characters: ( ) [ ] , . : ; ! | l i 1 t f j
    else if ('()[],.;:!|'.includes(ch)) w += 0.3;
    else if ('liftj1'.includes(ch)) w += 0.3;
    // Medium-narrow: r s e a c o n u
    else if ('rseaconu'.includes(ch)) w += 0.45;
    // Wide: m w M W
    else if ('mwMW'.includes(ch)) w += 0.7;
    // Greek/special Unicode: π etc — roughly normal width
    else if (ch.charCodeAt(0) > 127) w += 0.5;
    // Default (most letters, digits)
    else w += 0.5;
  }
  return w * fontSize;
}

// Render LaTeX labels with fractions/underbraces as SVG elements
function renderLaTeXSVG(rawText, x, y, fontSize, fill, anchor, opacity) {
  x = parseFloat(x); y = parseFloat(y);
  const opAttr = (opacity !== undefined && opacity !== 1) ? ` opacity="${opacity}"` : '';
  // Parse the LaTeX text into segments: plain text, fractions, underbraces
  const segments = parseLaTeXSegments(rawText);
  // Layout segments left-to-right
  const parts = []; // {type, svgStr, width, height}
  let totalWidth = 0;
  for (const seg of segments) {
    if (seg.type === 'frac') {
      const numText = stripLaTeX(seg.num);
      const denText = stripLaTeX(seg.den);
      const fracFontSize = fontSize * 0.75;
      const numW = _estimateTextWidth(numText, fracFontSize);
      const denW = _estimateTextWidth(denText, fracFontSize);
      const fracW = Math.max(numW, denW) + fracFontSize * 0.3;
      const fracH = fontSize * 2;
      parts.push({type:'frac', numText, denText, fracFontSize, fracW, fracH, width: fracW});
      totalWidth += fracW;
    } else if (seg.type === 'underbrace') {
      const braceW = seg.width || fontSize * 8;
      const labelText = stripLaTeX(seg.label || '');
      parts.push({type:'underbrace', braceW, labelText, width: braceW});
      totalWidth += braceW;
    } else {
      // Plain text
      const w = _estimateTextWidth(seg.text, fontSize);
      parts.push({type:'text', text: seg.text, width: w});
      totalWidth += w;
    }
  }
  // Compute starting X based on anchor
  let startX = x;
  if (anchor === 'middle') startX = x - totalWidth / 2;
  else if (anchor === 'end') startX = x - totalWidth;
  let curX = startX;
  const els = [];
  for (const p of parts) {
    if (p.type === 'frac') {
      const cx = curX + p.width / 2;
      // Numerator above line
      els.push(`<text x="${fmt(cx)}" y="${fmt(y - fontSize*0.35)}" fill="${fill}" font-size="${fmt(p.fracFontSize)}" text-anchor="middle" dominant-baseline="central" font-family="serif"${opAttr}>${escSvg(p.numText)}</text>`);
      // Fraction line
      els.push(`<line x1="${fmt(curX + fontSize*0.1)}" y1="${fmt(y - fontSize*0.05)}" x2="${fmt(curX + p.width - fontSize*0.1)}" y2="${fmt(y - fontSize*0.05)}" stroke="${fill}" stroke-width="0.7"${opAttr}/>`);
      // Denominator below line
      els.push(`<text x="${fmt(cx)}" y="${fmt(y + fontSize*0.35)}" fill="${fill}" font-size="${fmt(p.fracFontSize)}" text-anchor="middle" dominant-baseline="central" font-family="serif"${opAttr}>${escSvg(p.denText)}</text>`);
    } else if (p.type === 'underbrace') {
      const cx = curX + p.width / 2;
      const by = y + fontSize * 0.3;
      const bh = fontSize * 0.4;
      // Underbrace as a path: left arm → center dip → right arm
      els.push(`<path d="M${fmt(curX)},${fmt(by)} Q${fmt(curX)},${fmt(by+bh)} ${fmt(cx)},${fmt(by+bh)} Q${fmt(curX+p.width)},${fmt(by+bh)} ${fmt(curX+p.width)},${fmt(by)}" fill="none" stroke="${fill}" stroke-width="0.7"${opAttr}/>`);
      if (p.labelText) {
        els.push(`<text x="${fmt(cx)}" y="${fmt(by + bh + fontSize*0.7)}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="middle" dominant-baseline="central" font-family="serif"${opAttr}>${escSvg(p.labelText)}</text>`);
      }
    } else {
      els.push(`<text x="${fmt(curX)}" y="${fmt(y)}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="start" dominant-baseline="central" font-family="serif"${opAttr}>${escSvg(p.text)}</text>`);
    }
    curX += p.width;
  }
  return `<g>${els.join('')}</g>`;
}

// Parse LaTeX string into segments of {type:'text'|'frac'|'underbrace', ...}
function parseLaTeXSegments(text) {
  if (!text) return [{type:'text', text:''}];
  let s = text.replace(/\$/g, '');
  const segments = [];
  let remaining = s;
  while (remaining.length > 0) {
    // Find next \frac or \underbrace
    const fracIdx = remaining.indexOf('\\frac');
    const ubIdx = remaining.indexOf('\\underbrace');
    let nextIdx = -1, nextType = '';
    if (fracIdx >= 0 && (ubIdx < 0 || fracIdx < ubIdx)) { nextIdx = fracIdx; nextType = 'frac'; }
    else if (ubIdx >= 0) { nextIdx = ubIdx; nextType = 'underbrace'; }
    if (nextIdx < 0) {
      // No more special commands
      const cleaned = stripLaTeX(remaining);
      if (cleaned) segments.push({type:'text', text: cleaned});
      break;
    }
    // Plain text before this command
    if (nextIdx > 0) {
      const before = stripLaTeX(remaining.substring(0, nextIdx));
      if (before) segments.push({type:'text', text: before});
    }
    if (nextType === 'frac') {
      remaining = remaining.substring(nextIdx + 5); // skip \frac
      remaining = remaining.replace(/^\s*\\left\s*/, ''); // skip optional \left
      const num = extractBraced(remaining);
      remaining = remaining.substring(num.consumed);
      remaining = remaining.replace(/^\s*\\right\s*/, ''); // skip optional \right
      const den = extractBraced(remaining);
      remaining = remaining.substring(den.consumed);
      segments.push({type:'frac', num: num.content, den: den.content});
    } else if (nextType === 'underbrace') {
      remaining = remaining.substring(nextIdx + 11); // skip \underbrace
      const content = extractBraced(remaining);
      remaining = remaining.substring(content.consumed);
      // Check for _label after underbrace
      let label = '';
      const labelMatch = remaining.match(/^\s*_\s*\{([^}]*)\}/);
      if (labelMatch) {
        label = labelMatch[1];
        remaining = remaining.substring(labelMatch[0].length);
      }
      // Estimate width from \hspace if present
      let width = 0;
      const hspaceMatch = content.content.match(/\\hspace\s*\{([^}]*)\}/);
      if (hspaceMatch) {
        const valMatch = hspaceMatch[1].match(/([\d.]+)/);
        if (valMatch) width = parseFloat(valMatch[1]) * 28.35; // cm to points
      }
      segments.push({type:'underbrace', width, label});
    }
  }
  if (segments.length === 0) segments.push({type:'text', text: stripLaTeX(text)});
  return segments;
}

// Extract content inside braces: {content}, returns {content, consumed}
function extractBraced(s) {
  let i = 0;
  while (i < s.length && s[i] !== '{') i++;
  if (i >= s.length) return {content: '', consumed: i};
  let depth = 0, start = i;
  for (; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return {content: s.substring(start+1, i), consumed: i+1}; }
  }
  return {content: s.substring(start+1), consumed: s.length};
}

function fmt(n) { return Number(n.toFixed(4)); }
function opacityAttr(o) { return (o !== undefined && o !== 1) ? ` opacity="${fmt(o)}"` : ''; }
function escSvg(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ============================================================
// AST Caching for Slide Mode Performance
// ============================================================

let cachedTokens = null;
let cachedAST = null;
let cachedCode = '';

function renderWithCache(code) {
  // Check if code only differs in number literals
  const newTokens = lex(code);
  let canReuse = false;

  if (cachedTokens && cachedAST) {
    canReuse = tokensMatchStructure(cachedTokens, newTokens);
  }

  let ast;
  if (canReuse) {
    // Patch number literals in cached AST
    ast = patchASTNumbers(cachedAST, cachedTokens, newTokens);
  } else {
    ast = parse(newTokens);
    cachedAST = ast;
  }

  cachedTokens = newTokens;
  cachedCode = code;
  return ast;
}

function tokensMatchStructure(oldToks, newToks) {
  if (oldToks.length !== newToks.length) return false;
  for (let i = 0; i < oldToks.length; i++) {
    const a = oldToks[i], b = newToks[i];
    if (a.type !== b.type) return false;
    // Allow NUMBER values to differ
    if (a.type === T.NUMBER) continue;
    if (a.value !== b.value) return false;
  }
  return true;
}

function patchASTNumbers(ast, oldToks, newToks) {
  // Find NUMBER tokens that changed and build a mapping
  const changes = new Map(); // old value → new value, keyed by position
  const changedPositions = [];
  for (let i = 0; i < oldToks.length; i++) {
    if (oldToks[i].type === T.NUMBER && oldToks[i].value !== newToks[i].value) {
      changedPositions.push({line: oldToks[i].line, col: oldToks[i].col, newVal: newToks[i].value});
    }
  }
  if (changedPositions.length === 0) return ast;

  // Deep clone and patch
  const cloned = JSON.parse(JSON.stringify(ast));
  walkAST(cloned, (node) => {
    if (node.type === 'NumberLit') {
      for (const cp of changedPositions) {
        if (node.line === cp.line) {
          node.value = cp.newVal;
          break; // Only patch first match per node
        }
      }
    }
  });
  return cloned;
}

// ============================================================
// Public API: window.AsyInterp
// ============================================================

// Feature detection: what can we interpret?
function canInterpret(code) {
  // Reject features we can't handle
  if (/\bstruct\b/.test(code)) return false;
  // 3D wireframe is supported; only block surface-heavy code
  if (/\bsurface\s*\(/.test(code) || /\bsurface\s+\w/.test(code)) return false;
  if (/\bimport\s+contour\b/.test(code)) return false;
  if (/\bimport\s+flowchart\b/.test(code)) return false;
  if (/\bimport\s+animation\b/.test(code)) return false;
  if (/\bimport\s+trembling\b/.test(code)) return false;
  if (/\bimport\s+palette\b/.test(code)) return false;
  if (/\bfile\b/.test(code) && /\binput\b/.test(code)) return false;
  if (/\bsettings\b/.test(code)) return false;
  if (/\btexpath\b/.test(code)) return false;
  if (/\bshipout\b/.test(code)) return false;
  // picture support is now implemented
  // Accept everything else
  return true;
}

function render(code, opts) {
  const interp = createInterpreter();
  const result = interp.execute(code);
  return renderSVG(result, opts);
}

window.AsyInterp = {
  canInterpret,
  render,
  lex,
  parse,
  _createInterpreter: createInterpreter,
  _renderSVG: renderSVG,
};

})();
