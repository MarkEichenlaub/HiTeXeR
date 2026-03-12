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
  'int','real','pair','triple','string','bool','bool3','pen','path','guide',
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
        if (ch() === '\\') { advance(); s += ch(); } else { s += ch(); }
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
        if (ch() === '\\') { advance(); s += ch(); } else { s += ch(); }
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
        else if(ch()==='-'){advance();add(T.DASHDASH,'--');}
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
function ArrayExpr(elements,line) { return {type:'ArrayExpr',elements,line}; }
function BinaryOp(op,left,right,line) { return {type:'BinaryOp',op,left,right,line}; }
function UnaryOp(op,operand,line) { return {type:'UnaryOp',op,operand,line}; }
function FuncCall(callee,args,line) { return {type:'FuncCall',callee,args,line}; }
function MemberAccess(object,member,line) { return {type:'MemberAccess',object,member,line}; }
function ArrayAccess(object,index,line) { return {type:'ArrayAccess',object,index,line}; }
function TernaryOp(cond,then_,else_,line) { return {type:'TernaryOp',cond,then:then_,else:else_,line}; }
function CastExpr(targetType,expr,line) { return {type:'CastExpr',targetType,expr,line}; }
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

  // Check for declaration: type name = ... or type name ; or type name ,
  function isDeclaration() {
    if (!isTypeName()) return false;
    const next = peekType(1);
    if (next === T.IDENT) return true;
    // type[] name
    if (next === T.LBRACKET && peekType(2) === T.RBRACKET && peekType(3) === T.IDENT) return true;
    return false;
  }

  // Check for function declaration: type name(...)
  function isFuncDecl() {
    if (!isTypeName()) return false;
    if (peekType(1) === T.IDENT && peekType(2) === T.LPAREN) return true;
    // type[] name(
    if (peekType(1) === T.LBRACKET && peekType(2) === T.RBRACKET && peekType(3) === T.IDENT && peekType(4) === T.LPAREN) return true;
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
      const retType = eat(T.IDENT).value;
      let isArr = false;
      if (tryEat(T.LBRACKET)) { eat(T.RBRACKET); isArr = true; }
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
          return parseFuncDeclBody(retType + (isArr ? '[]' : ''), name, cur().line);
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
    if (tryEat(T.LBRACKET)) { eat(T.RBRACKET); varType += '[]'; }
    const stmts = [];
    do {
      const name = eat(T.IDENT).value;
      let init = null;
      if (tryEat(T.ASSIGN)) init = parseExpr();
      stmts.push(VarDecl(varType, name, init, ln));
    } while (tryEat(T.COMMA));
    if (!noSemi) tryEat(T.SEMI);
    return stmts.length === 1 ? stmts[0] : {type:'MultiDecl', stmts, line:ln};
  }

  function parseFuncDeclBody(retType, name, ln) {
    eat(T.LPAREN);
    const params = [];
    while (!at(T.RPAREN) && !at(T.EOF)) {
      let pType = 'real';
      if (isTypeName()) { pType = eat(T.IDENT).value; if(tryEat(T.LBRACKET)){eat(T.RBRACKET);pType+='[]';} }
      const pName = eat(T.IDENT).value;
      let pDefault = null;
      if (tryEat(T.ASSIGN)) pDefault = parseExpr();
      params.push({type:pType, name:pName, default:pDefault});
      if (!tryEat(T.COMMA)) break;
    }
    eat(T.RPAREN);
    const body = parseBlock();
    return FuncDecl(retType, name, params, body, ln);
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
    if (!noSemi) tryEat(T.SEMI);
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
      case T.DASHDASH: case T.DOTDOT: case T.DOTDOTDOT: case T.HATHAT: return 6; // path join at same level
      case T.LBRACE: {
        // {dir} after a point starts a path direction — give it path-join precedence
        // so (0,0){1,0}..{1,0}(1,1) works inside function call args
        // Also handle named directions: {up}, {down}, {left}, {right}, etc.
        if (pos + 2 < tokens.length && tokens[pos+1].type === T.IDENT
            && NAMED_DIRS && NAMED_DIRS[tokens[pos+1].value]
            && tokens[pos+2].type === T.RBRACE) return 6;
        // Quick lookahead: check for {expr,expr} pattern (exactly one comma at depth 0)
        let d = 0, commas = 0;
        for (let i = pos + 1; i < tokens.length; i++) {
          if (tokens[i].type === T.LBRACE || tokens[i].type === T.LPAREN) d++;
          else if (tokens[i].type === T.RPAREN) d--;
          else if (tokens[i].type === T.RBRACE) { if (d === 0) break; d--; }
          else if (d === 0 && tokens[i].type === T.COMMA) commas++;
        }
        return commas === 1 ? 6 : 0;
      }
      case T.STAR: case T.SLASH: case T.PERCENT: return 7;
      case T.CARET: return 9; // right-assoc
      case T.QUESTION: return 1; // ternary
      case T.DOT: return 11;
      case T.LPAREN: return 10; // function call
      case T.LBRACKET: return 10; // array access
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
      // Support named parameters: name=value (skip the name, use the value)
      if (at(T.IDENT) && pos+1 < tokens.length && tokens[pos+1].type === T.ASSIGN) {
        pos += 2; // skip identifier and '='
        args.push(parseExpr());
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
        const nextPoint = parseExpr(6);
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

      const point = parseExpr(6); // parse at additive level to avoid consuming next --/..
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
    if (t.type === T.MINUSMINUS_OP) {
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

    // new — anonymous function or array
    if (t.type === T.IDENT && t.value === 'new') {
      pos++;
      const aType = at(T.IDENT) ? eat(T.IDENT).value : 'real';
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
      if (tryEat(T.LBRACKET)) eat(T.RBRACKET);
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

    // Parenthesized expr or pair literal
    if (t.type === T.LPAREN) {
      pos++;
      const first = parseExpr();
      if (at(T.COMMA)) {
        // Pair literal (x, y)
        eat(T.COMMA);
        const second = parseExpr();
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
function makePen(props) {
  return Object.assign({_tag:'pen', r:0, g:0, b:0, linewidth:0.5, linestyle:null,
    fontsize:12, opacity:1, linecap:null, linejoin:null, fillrule:null}, props);
}
function makeTransform(a,b,c,d,e,f) { return {_tag:'transform',a,b,c,d,e,f}; }
function makePath(segs, closed) { return {_tag:'path', segs: segs||[], closed:!!closed}; }
// seg = {p0:{x,y}, cp1:{x,y}, cp2:{x,y}, p3:{x,y}}
function makeSeg(p0,cp1,cp2,p3) { return {p0,cp1,cp2,p3}; }
function lineSegment(a,b) { return makeSeg(a, {x:a.x+(b.x-a.x)/3,y:a.y+(b.y-a.y)/3}, {x:a.x+2*(b.x-a.x)/3,y:a.y+2*(b.y-a.y)/3}, b); }

function isPair(v) { return v && v._tag === 'pair'; }
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
  // b overrides non-default properties
  if (b.r !== 0 || b.g !== 0 || b.b !== 0) { r.r=b.r; r.g=b.g; r.b=b.b; }
  if (b.linewidth !== 0.5) r.linewidth = b.linewidth;
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
  // Settings
  let unitScale = 1;       // unitsize value in points
  let sizeW = 0, sizeH = 0;
  let defaultPen = makePen({});
  let iterationLimit = 100000;

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
      case 'ArrayExpr': return node.elements.map(e => evalNode(e,env));
      case 'BinaryOp': return evalBinary(node, env);
      case 'UnaryOp': return evalUnary(node, env);
      case 'FuncCall': return evalFuncCall(node, env);
      case 'MemberAccess': return evalMemberAccess(node, env);
      case 'ArrayAccess': return evalArrayAccess(node, env);
      case 'TernaryOp': return toBool(evalNode(node.cond,env)) ? evalNode(node.then,env) : evalNode(node.else,env);
      case 'CastExpr': return evalCast(node, env);
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
    if (typeof v === 'number') return makePair(v, 0);
    return makePair(0,0);
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
    if (op === T.PLUS && isPen(left)) return mergePens(left, isPen(right) ? right : makePen({r:0,g:0,b:0}));
    if (op === T.PLUS && isPen(right)) return mergePens(isPen(left) ? left : makePen({r:0,g:0,b:0}), right);

    // Pair ops
    if (isPair(left) && isPair(right)) {
      switch(op) {
        case T.PLUS: return makePair(left.x+right.x, left.y+right.y);
        case T.MINUS: return makePair(left.x-right.x, left.y-right.y);
        case T.STAR: return makePair(left.x*right.x - left.y*right.y, left.x*right.y + left.y*right.x); // complex multiply
        case T.SLASH: { const d=right.x*right.x+right.y*right.y; return d?makePair((left.x*right.x+left.y*right.y)/d,(left.y*right.x-left.x*right.y)/d):makePair(0,0); }
        case T.EQ: return left.x===right.x && left.y===right.y;
        case T.NEQ: return left.x!==right.x || left.y!==right.y;
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
    // Transform * transform
    if (isTransform(left) && isTransform(right)) return composeTransforms(right, left);

    // String concatenation
    if (isString(left) || isString(right)) {
      if (op === T.PLUS) return String(isPair(left)?pairToStr(left):left) + String(isPair(right)?pairToStr(right):right);
    }

    // Number ops
    const l = toNumber(left), r = toNumber(right);
    switch(op) {
      case T.PLUS: return l+r;
      case T.MINUS: return l-r;
      case T.STAR: return l*r;
      case T.SLASH: return r!==0?l/r:0;
      case T.PERCENT: return r!==0?l%r:0;
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
      if (calleeName === 'dot') return evalDot(args);
      return evalDraw(calleeName, args);
    }

    if (typeof callee === 'function') {
      const args = node.args.map(a => evalNode(a, env));
      return callee(...args);
    }
    if (callee && callee._tag === 'func') {
      return callUserFunc(callee, node.args, env);
    }

    // Type constructor calls: pair(x,y), real(x), int(x), etc.
    if (calleeName === 'pair' && node.args.length === 2) {
      return makePair(toNumber(evalNode(node.args[0],env)), toNumber(evalNode(node.args[1],env)));
    }

    // Unknown function - return null
    return null;
  }

  function callUserFunc(func, argNodes, callEnv) {
    const local = createEnv(func.closure);
    const params = func.params;
    for (let i = 0; i < params.length; i++) {
      if (i < argNodes.length) {
        local.set(params[i].name, evalNode(argNodes[i], callEnv));
      } else if (params[i].default) {
        local.set(params[i].name, evalNode(params[i].default, local));
      } else {
        local.set(params[i].name, null);
      }
    }
    try {
      evalNode(func.body, local);
    } catch(e) {
      if (e && e._sig === 'return') return e.value;
      throw e;
    }
    return null;
  }

  // Call a user-defined function with already-evaluated argument values
  function callUserFuncValues(func, argValues) {
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
      if (e && e._sig === 'return') return e.value;
      throw e;
    }
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

    return null;
  }

  function evalMemberAccess(node, env) {
    const obj = evalNode(node.object, env);
    const m = node.member;
    if (isPair(obj)) {
      if (m === 'x') return obj.x;
      if (m === 'y') return obj.y;
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
    if (isArray(obj)) return obj[Math.floor(idx)];
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
    const points = [];
    const joins = [];
    let hasCycle = false;

    for (let i = 0; i < node.nodes.length; i++) {
      const n = node.nodes[i];
      if (n.isCycle) {
        hasCycle = true;
        continue;
      }
      const val = evalNode(n.point, env);
      points.push(toPair(val));
      if (n.join) joins.push(n.join);
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
          case 'pen': val = makePen({}); break;
          case 'path': case 'guide': val = makePath([],false); break;
          case 'transform': val = makeTransform(0,1,0,0,0,1); break;
          case 'string': val = ''; break;
          case 'bool': val = false; break;
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
    if (mod.includes('olympiad') || mod.includes('cse5') || mod.includes('geometry') || mod.includes('math') || mod.includes('markers') || mod.includes('solids') || mod.includes('contour') || mod.includes('palette')) {
      // Gracefully ignored — stubs/features already in stdlib or not needed for 2D rendering
    }
    if (mod.includes('graph')) {
      installGraphPackage(env);
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

    // Named colors from ASY_COLORS (hex → pen)
    const ASY_COLORS = {
      black:'#000000', white:'#ffffff', gray:'#808080', red:'#ff0000',
      blue:'#0000ff', green:'#00b300', yellow:'#ffff00', cyan:'#00ffff',
      magenta:'#ff00ff', orange:'#ff8c00', purple:'#8000bf', brown:'#804000',
      pink:'#ffc0cb',
      lightblue:'#87ceeb', lightgreen:'#90ee90', lightred:'#ff8080',
      lightyellow:'#ffffe0', lightgray:'#bfbfbf',
      darkblue:'#000080', darkgreen:'#006400', darkred:'#8b0000',
      heavyblue:'#0000bf', heavygreen:'#005900', heavyred:'#bf0000',
      paleblue:'#c0d0ff', palegreen:'#c0ffc0', palered:'#ffc0c0',
      paleyellow:'#ffffc0', palecyan:'#c0ffff', palemagenta:'#ffc0ff',
      deepblue:'#0000a0', deepgreen:'#004d00', deepred:'#a00000',
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
    env.set('nullpath', makePath([],false));
    env.set('nullpen', makePen({opacity:0}));
    env.set('currentpen', makePen({}));
    env.set('currentpicture', null);
    env.set('currentprojection', null);
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
        const a = toNumber(args[0]);
        return makePair(Math.cos(a*Math.PI/180), Math.sin(a*Math.PI/180));
      }
      return makePair(1,0);
    });
    env.set('unit', (p) => {
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

    env.set('arc', (center, r, a1, a2) => {
      const c = toPair(center);
      return makeArcPath(c, toNumber(r), toNumber(a1), toNumber(a2));
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

    // Path query functions
    env.set('point', (p, t) => {
      if (!isPath(p)) return makePair(0,0);
      const time = toNumber(t);
      const i = Math.floor(time);
      const frac = time - i;
      const idx = Math.max(0, Math.min(i, p.segs.length-1));
      if (p.segs.length === 0) return makePair(0,0);
      return bezierPoint(p.segs[idx], Math.max(0, Math.min(1, frac)));
    });

    env.set('relpoint', (p, t) => {
      if (!isPath(p)) return makePair(0,0);
      const time = toNumber(t) * p.segs.length;
      return env.get('point')(p, time);
    });

    env.set('midpoint', (...args) => {
      if (args.length === 1 && isPath(args[0])) {
        const p = args[0];
        return env.get('point')(p, p.segs.length/2);
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
    env.set('rgb', (r,g,b) => makePen({r:toNumber(r),g:toNumber(g),b:toNumber(b)}));
    env.set('RGB', (r,g,b) => makePen({r:toNumber(r)/255,g:toNumber(g)/255,b:toNumber(b)/255}));
    env.set('linewidth', (w) => makePen({linewidth:toNumber(w)}));
    env.set('fontsize', (s) => makePen({fontsize:toNumber(s)}));
    env.set('opacity', (a) => makePen({opacity:toNumber(a)}));
    env.set('Pen', (n) => makePen({}));
    env.set('Symbol', (...args) => null);
    env.set('fontcommand', (...args) => makePen({}));
    env.set('cmyk', (c,m,y,k) => {
      const cc=toNumber(c),mm=toNumber(m),yy=toNumber(y),kk=toNumber(k);
      return makePen({r:(1-cc)*(1-kk),g:(1-mm)*(1-kk),b:(1-yy)*(1-kk)});
    });
    env.set('gray', (g) => {
      // If called as gray(number), return grayscale pen
      if (arguments.length > 0 && g !== undefined) {
        const v = toNumber(g);
        return makePen({r:v,g:v,b:v});
      }
      return makePen({r:0.5,g:0.5,b:0.5});
    });
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
      if (args.length >= 1) unitScale = toNumber(args[0]);
    });
    env.set('size', (...args) => {
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
          const ip = bezierBezierIntersect(s1, s2);
          if (ip) pts.push(ip);
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
      const o = env.get('circumcenter')(A,B,C);
      const a = toPair(A);
      return Math.sqrt((a.x-o.x)*(a.x-o.x)+(a.y-o.y)*(a.y-o.y));
    });

    env.set('circumcircle', (A,B,C) => {
      const o = env.get('circumcenter')(A,B,C);
      const r = env.get('circumradius')(A,B,C);
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
      const o = env.get('incenter')(A,B,C);
      const r = env.get('inradius')(A,B,C);
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
      const cc = env.get('circumcenter')(A,B,C);
      // H = A + B + C - 2*O
      return makePair(a.x+b.x+c.x-2*cc.x, a.y+b.y+c.y-2*cc.y);
    });

    // Labeling helpers
    env.set('Label', (...args) => {
      // Return the string argument for label()
      if (args.length >= 1 && isString(args[0])) return args[0];
      return '';
    });

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

    // Array functions
    env.set('array', (...args) => args);
    env.set('sequence', (f, n) => {
      const result = [];
      const count = Math.floor(toNumber(n));
      for (let i = 0; i < count; i++) {
        if (typeof f === 'function') result.push(f(i));
        else result.push(i);
      }
      return result;
    });
    env.set('map', (f, arr) => {
      if (!isArray(arr) || typeof f !== 'function') return [];
      return arr.map(f);
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

    // Fill types
    env.set('FillDraw', (...args) => {
      if (args.length >= 1 && isPen(args[0])) return args[0];
      return null;
    });
    env.set('Fill', (...args) => {
      if (args.length >= 1 && isPen(args[0])) return args[0];
      return null;
    });
    env.set('Draw', (...args) => {
      if (args.length >= 1 && isPen(args[0])) return args[0];
      return null;
    });
    env.set('NoFill', null);
    env.set('UnFill', null);

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

        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = a + (b - a) * i / n;
          try {
            const result = typeof funcArg === 'function' ? funcArg(t) : callUserFuncValues(funcArg, [t]);
            if (isPairFunc) {
              if (result && result._tag === 'pair' && isFinite(result.x) && isFinite(result.y)) {
                pts.push({x: result.x, y: result.y});
              }
            } else {
              const y = toNumber(result);
              if (isFinite(y)) pts.push({x: t, y});
            }
          } catch(e) { /* skip bad points */ }
        }
        return buildGraphPath(pts, smooth);
      }

      return makePath([], false);
    });

    // xaxis and yaxis
    env.set('xaxis', (...args) => {
      // xaxis(Label, real xmin, real xmax, pen, Ticks, Arrow, ...)
      // Simplified: draw an x-axis line with optional ticks
      let label = '', xmin = null, xmax = null, pen = null, ticks = null, arrow = null;
      for (const a of args) {
        if (isString(a) && !label) label = a;
        else if (typeof a === 'number') {
          if (xmin === null) xmin = a;
          else if (xmax === null) xmax = a;
        }
        else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
        else if (a && a._tag === 'arrow') arrow = a;
        else if (a && a._tag === 'ticks') ticks = a;
      }

      // Use bounding box if not specified
      if (xmin === null) xmin = -5;
      if (xmax === null) xmax = 5;
      if (!pen) pen = clonePen(defaultPen);

      const path = makePath([lineSegment({x:xmin,y:0},{x:xmax,y:0})], false);
      drawCommands.push({cmd:'draw', path, pen, arrow, line: 0});

      // Draw ticks
      if (ticks) {
        const step = ticks.step || 1;
        const tickSize = ticks.size || 0.1;
        for (let x = Math.ceil(xmin/step)*step; x <= xmax; x += step) {
          if (Math.abs(x) < 1e-10) continue; // skip origin
          const tickPath = makePath([lineSegment({x,y:-tickSize},{x,y:tickSize})], false);
          drawCommands.push({cmd:'draw', path:tickPath, pen, arrow:null, line: 0});
          if (ticks.labels) {
            drawCommands.push({cmd:'label', text:String(Math.round(x*1000)/1000), pos:{x,y:0}, align:{x:0,y:-1}, pen, line:0});
          }
        }
      }

      if (label) {
        drawCommands.push({cmd:'label', text: stripLaTeX(label), pos:{x:(xmin+xmax)/2, y:0}, align:{x:0,y:-1.5}, pen, line:0});
      }
    });

    env.set('yaxis', (...args) => {
      let label = '', ymin = null, ymax = null, pen = null, ticks = null, arrow = null;
      for (const a of args) {
        if (isString(a) && !label) label = a;
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

      const path = makePath([lineSegment({x:0,y:ymin},{x:0,y:ymax})], false);
      drawCommands.push({cmd:'draw', path, pen, arrow, line: 0});

      if (ticks) {
        const step = ticks.step || 1;
        const tickSize = ticks.size || 0.1;
        for (let y = Math.ceil(ymin/step)*step; y <= ymax; y += step) {
          if (Math.abs(y) < 1e-10) continue;
          const tickPath = makePath([lineSegment({x:-tickSize,y},{x:tickSize,y})], false);
          drawCommands.push({cmd:'draw', path:tickPath, pen, arrow:null, line: 0});
          if (ticks.labels) {
            drawCommands.push({cmd:'label', text:String(Math.round(y*1000)/1000), pos:{x:0,y}, align:{x:-1,y:0}, pen, line:0});
          }
        }
      }

      if (label) {
        drawCommands.push({cmd:'label', text: stripLaTeX(label), pos:{x:0, y:(ymin+ymax)/2}, align:{x:-1.5,y:0}, pen, line:0});
      }
    });

    // axes() - draw both axes
    env.set('axes', (...args) => {
      let xlabel = '', ylabel = '', xmin = null, xmax = null, ymin = null, ymax = null, pen = null, arrow = null, ticks = null;
      for (const a of args) {
        if (isString(a)) {
          if (!xlabel) xlabel = a;
          else if (!ylabel) ylabel = a;
        }
        else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
        else if (a && a._tag === 'arrow') arrow = a;
        else if (a && a._tag === 'ticks') ticks = a;
      }
      env.get('xaxis')(xlabel, pen, arrow);
      env.get('yaxis')(ylabel, pen, arrow);
    });

    // Ticks constructors
    env.set('Ticks', (...args) => {
      const t = {_tag: 'ticks', step: 1, size: 0.1, labels: true};
      for (const a of args) {
        if (typeof a === 'number') t.step = a;
        else if (isString(a)) { /* format string, ignored */ }
        else if (isPen(a)) t.pen = a;
      }
      return t;
    });
    env.set('LeftTicks', (...args) => {
      const t = env.get('Ticks')(...args);
      t.side = 'left';
      return t;
    });
    env.set('RightTicks', (...args) => {
      const t = env.get('Ticks')(...args);
      t.side = 'right';
      return t;
    });
    env.set('NoTicks', {_tag:'ticks', step:0, size:0, labels:false});

    // Scale types
    env.set('Linear', null);
    env.set('Log', null);
    env.set('Logarithmic', null);

    // xlimits/ylimits
    env.set('xlimits', (a, b) => null);
    env.set('ylimits', (a, b) => null);
    env.set('limits', (a, b) => null);
    env.set('crop', () => null);
  }

  // Draw command evaluators
  function evalDraw(cmd, args) {
    if (args.length === 0) return;
    let pathArg = null, pen = null, arrow = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === null || a === undefined) continue;
      if (isPath(a)) { if (!pathArg) pathArg = a; }
      else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
      else if (a && a._tag === 'arrow') arrow = a;
      else if (isPair(a) && !pathArg) {
        // Single pair treated as degenerate path (for dot)
        pathArg = makePath([], false);
        pathArg._singlePoint = a;
      }
    }
    if (!pathArg && args.length > 0) {
      const first = args[0];
      if (isPair(first)) {
        pathArg = makePath([], false);
        pathArg._singlePoint = first;
      }
    }
    if (!pen) pen = clonePen(defaultPen);
    if (pathArg) {
      drawCommands.push({cmd, path:pathArg, pen, arrow, line: args._line || 0});
    }
  }

  function evalDot(args) {
    if (args.length === 0) return;
    let pos = null, pen = null;
    for (const a of args) {
      if (isPair(a) && !pos) pos = a;
      else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
      else if (isPath(a) && a.segs.length > 0 && !pos) pos = a.segs[0].p0;
      else if (isString(a)) { /* label text, ignored for dot position */ }
    }
    if (!pos) return;
    if (!pen) pen = clonePen(defaultPen);
    drawCommands.push({cmd:'dot', pos, pen, line: args._line || 0});
  }

  function evalLabel(args) {
    if (args.length === 0) return;
    let text = '', pos = null, align = null, pen = null;
    for (const a of args) {
      if (isString(a) && !text) text = a;
      else if (isPair(a)) {
        if (!pos) pos = a;
        else if (!align) align = a;
      }
      else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
    }
    if (!pos) pos = makePair(0,0);
    if (!pen) pen = clonePen(defaultPen);
    drawCommands.push({cmd:'label', text, pos, align, pen, line: args._line || 0});
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
    // Approximate intersection by sampling
    const N = 32;
    let bestDist = Infinity, bestPt = null;
    for (let i = 0; i <= N; i++) {
      const p1 = bezierPoint(s1, i/N);
      for (let j = 0; j <= N; j++) {
        const p2 = bezierPoint(s2, j/N);
        const d = Math.sqrt((p1.x-p2.x)*(p1.x-p2.x)+(p1.y-p2.y)*(p1.y-p2.y));
        if (d < bestDist) { bestDist = d; bestPt = makePair((p1.x+p2.x)/2,(p1.y+p2.y)/2); }
      }
    }
    return bestDist < 0.01 ? bestPt : null;
  }

  // Main execution
  function execute(code) {
    // Reset state
    drawCommands.length = 0;
    unitScale = 1;
    sizeW = 0; sizeH = 0;
    defaultPen = makePen({});

    const tokens = lex(code);
    const ast = parse(tokens);

    // Walk AST and track source lines for draw commands
    patchDrawLines(ast, globalEnv);

    evalNode(ast, globalEnv);

    return {
      drawCommands: drawCommands.slice(),
      unitScale,
      sizeW, sizeH,
      defaultPen,
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
  const { drawCommands, unitScale, sizeW, sizeH } = result;
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
    } else if (dc.path) {
      if (dc.path._singlePoint) {
        expandBBox(dc.path._singlePoint.x, dc.path._singlePoint.y);
      }
      for (const seg of dc.path.segs) expandBezierBBox(seg);
    }
  }

  // Add padding
  if (!isFinite(minX)) { minX=0; minY=0; maxX=1; maxY=1; }
  const pad = 0.5;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  const warnings = [];

  // Determine scale
  const hasExplicitScale = unitScale > 1 || sizeW > 0 || sizeH > 0;
  let pxPerUnit;
  if (unitScale > 1) {
    pxPerUnit = unitScale;
  } else if (!hasExplicitScale) {
    // No unitsize/size: mimic AoPS behavior by auto-scaling
    const bboxW = maxX - minX, bboxH = maxY - minY;
    const targetPx = 340; // ~12cm at 72dpi
    pxPerUnit = targetPx / Math.max(bboxW, bboxH, 1);
    warnings.push('auto-scaled');
  } else {
    pxPerUnit = unitScale || 28.35;
  }

  const naturalW = (maxX - minX) * pxPerUnit;
  const naturalH = (maxY - minY) * pxPerUnit;

  // Apply explicit size() if given
  let svgW = naturalW, svgH = naturalH;
  if (sizeW > 0) svgW = sizeW;
  if (sizeH > 0) svgH = sizeH;

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

  // For each draw command, generate SVG content
  for (let ci = 0; ci < drawCommands.length; ci++) {
    const dc = drawCommands[ci];
    const css = penToCSS(dc.pen);
    const dashArray = linestyleToDasharray(dc.pen ? dc.pen.linestyle : null, css.strokeWidth);

    if (dc.cmd === 'dot') {
      const sx = (dc.pos.x - minX) * pxPerUnit;
      const sy = (maxY - dc.pos.y) * pxPerUnit; // flip Y
      const r = dc.pen.linewidth > 1 ? dc.pen.linewidth : 3;
      elements.push(`<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(r)}" fill="${css.fill}" stroke="none"${opacityAttr(css.opacity)}/>`);
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
    } else if (dc.cmd === 'label') {
      const sx = (dc.pos.x - minX) * pxPerUnit;
      const sy = (maxY - dc.pos.y) * pxPerUnit;
      let dx = 0, dy = 0;
      if (dc.align) {
        dx = dc.align.x * 10;
        dy = -dc.align.y * 10; // flip Y for SVG
      }
      const cleanText = stripLaTeX(dc.text);
      const fontSize = dc.pen.fontsize || 12;
      elements.push(`<text x="${fmt(sx+dx)}" y="${fmt(sy+dy)}" fill="${css.fill}" font-size="${fmt(fontSize)}" text-anchor="middle" dominant-baseline="central" font-family="serif"${opacityAttr(css.opacity)}>${escSvg(cleanText)}</text>`);
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
    } else if (dc.path) {
      // draw / fill / filldraw / clip
      if (dc.path._singlePoint) {
        // Degenerate: single point
        const p = dc.path._singlePoint;
        const sx = (p.x - minX) * pxPerUnit;
        const sy = (maxY - p.y) * pxPerUnit;
        elements.push(`<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="3" fill="${css.fill}" stroke="none"${opacityAttr(css.opacity)}/>`);
        commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
        continue;
      }
      if (dc.path.segs.length === 0) continue;

      const d = pathToD(dc.path, minX, maxY, pxPerUnit);
      let fill = 'none', stroke = 'none', strokeW = 0;

      if (dc.cmd === 'fill' || dc.cmd === 'unfill') {
        fill = dc.cmd === 'unfill' ? '#ffffff' : css.fill;
      } else if (dc.cmd === 'filldraw') {
        fill = css.fill;
        stroke = css.stroke;
        strokeW = css.strokeWidth;
      } else if (dc.cmd === 'clip') {
        continue; // skip clip for now
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
        const arrowEl = generateArrowHead(dc, minX, maxY, pxPerUnit, css);
        if (arrowEl) {
          elements.push(arrowEl);
          commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
        }
      }
    }
  }

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(svgW)}" height="${fmt(svgH)}" viewBox="0 0 ${fmt(viewW)} ${fmt(viewH)}">\n${elements.join('\n')}\n</svg>`;

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

    if (i === 0) d += `M${fmt(p0x)} ${fmt(p0y)}`;
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
    default: return null;
  }
}

function generateArrowHead(dc, minX, maxY, scale, css) {
  const path = dc.path;
  const style = dc.arrow.style;
  const size = (dc.arrow.size || 6) * (css.strokeWidth || 0.5);

  // Get endpoint and tangent direction
  let segs = path.segs;
  if (segs.length === 0) return null;

  const arrowParts = [];

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
    const headAngle = 25 * Math.PI / 180;
    // Arrow head in screen coordinates (Y is already flipped)
    const screenAngle = -tangentAngle; // flip Y for screen coords
    const s = size * scale * 0.15;
    const lx = tipX - s*Math.cos(screenAngle - headAngle);
    const ly = tipY + s*Math.sin(screenAngle - headAngle);
    const rx = tipX - s*Math.cos(screenAngle + headAngle);
    const ry = tipY + s*Math.sin(screenAngle + headAngle);
    return `M${fmt(lx)} ${fmt(ly)} L${fmt(tipX)} ${fmt(tipY)} L${fmt(rx)} ${fmt(ry)}`;
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
  const d = arrowParts.join(' ');
  return `<path d="${d}" fill="none" stroke="${css.stroke}" stroke-width="${fmt(css.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function stripLaTeX(text) {
  if (!text) return '';
  let s = text;
  // Remove $ delimiters
  s = s.replace(/\$/g, '');
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
    '\\cdot':'·','\\leq':'≤','\\geq':'≥','\\neq':'≠','\\approx':'≈',
    '\\equiv':'≡','\\in':'∈','\\notin':'∉','\\subset':'⊂','\\supset':'⊃',
    '\\cup':'∪','\\cap':'∩','\\forall':'∀','\\exists':'∃','\\neg':'¬',
    '\\wedge':'∧','\\vee':'∨','\\oplus':'⊕','\\otimes':'⊗',
    '\\rightarrow':'→','\\leftarrow':'←','\\Rightarrow':'⇒','\\Leftarrow':'⇐',
    '\\leftrightarrow':'↔','\\triangle':'△','\\angle':'∠','\\perp':'⊥',
    '\\parallel':'∥','\\circ':'∘','\\bullet':'•','\\star':'★','\\dagger':'†',
    '\\ell':'ℓ', '\\prime':'′',
  };
  for (const [cmd, uni] of Object.entries(texMap)) {
    s = s.split(cmd).join(uni);
  }
  // Remove remaining \command sequences
  s = s.replace(/\\[a-zA-Z]+/g, '');
  // Remove braces
  s = s.replace(/[{}]/g, '');
  // Remove ^ and _ with single char
  s = s.replace(/[_^](.)/g, '$1');
  return s.trim();
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
  if (/\btriple\b/.test(code)) return false;
  if (/\bimport\s+three\b/.test(code)) return false;
  if (/\bimport\s+graph3\b/.test(code)) return false;
  if (/\bimport\s+solids\b/.test(code)) return false;
  if (/\bimport\s+contour\b/.test(code)) return false;
  if (/\bimport\s+flowchart\b/.test(code)) return false;
  if (/\bimport\s+animation\b/.test(code)) return false;
  if (/\bimport\s+trembling\b/.test(code)) return false;
  if (/\bimport\s+palette\b/.test(code)) return false;
  if (/\bfile\b/.test(code) && /\binput\b/.test(code)) return false;
  if (/\bsettings\b/.test(code)) return false;
  if (/\btexpath\b/.test(code)) return false;
  if (/\bshipout\b/.test(code)) return false;
  if (/\bpicture\s+\w+\s*=/.test(code)) return false; // custom pictures
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
