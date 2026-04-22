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
  'picture','transform','transform3','void','var','Label','file','frame',
  'projection','revolution','surface','material','patch','tube','coloredpath',
  'coordsys','point','vector',
  'line','segment','circle','triangle',
  'side','vertex',
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

    // Handle literal \t \n \r escape sequences outside strings (some corpus files
    // have tab/newline characters encoded as backslash + letter instead of real
    // whitespace bytes).  We treat them the same as actual whitespace.  The
    // LaTeX-lookahead that the string lexer uses (\textbf etc.) is unnecessary
    // here because LaTeX commands only appear inside string literals.
    if (ch() === '\\' && pos + 1 < len) {
      const nc = source[pos + 1];
      if (nc === 't' || nc === 'n' || nc === 'r') {
        advance(); advance(); continue;
      }
    }

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
      // Scientific notation: only consume 'e' if followed by an optional sign
      // and at least one digit. Otherwise leave 'e' to be part of an identifier
      // (e.g. "3exp(...)" means "3 * exp(...)" via implicit multiplication).
      if (ch() === 'e' || ch() === 'E') {
        const off = (peek(1) === '+' || peek(1) === '-') ? 2 : 1;
        const after = peek(off);
        if (after >= '0' && after <= '9') {
          num += ch(); advance();
          if (ch() === '+' || ch() === '-') { num += ch(); advance(); }
          while (pos < len && ch() >= '0' && ch() <= '9') { num += ch(); advance(); }
        }
      }
      tokens.push({type:T.NUMBER, value:parseFloat(num), isInt:!num.includes('.')&&!num.includes('e')&&!num.includes('E'), line:startLine, col:startCol});
      continue;
    }

    // Strings
    if (ch() === '"') {
      advance(); let s = '';
      while (pos < len && ch() !== '"') {
        if (ch() === '\\') {
          advance();
          if (ch() === 'n') { s += '\n'; }
          else if (ch() === '\\') { s += '\\\\'; } else if (ch() === '"') { s += '"'; }
          else { s += '\\'; s += ch(); } // preserve backslash for LaTeX etc. (\t→\textbf, etc.)
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
          if (ch() === 'n') { s += '\n'; }
          else if (ch() === '\\') { s += '\\'; } else if (ch() === "'") { s += "'"; }
          else { s += '\\'; s += ch(); } // preserve backslash for LaTeX etc.
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
function NumberLit(value,line,isInt) { return {type:'NumberLit',value,line,isInt:!!isInt}; }
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

    // struct Name { ... }   -- minimal support: register Name as a type and skip body.
    // Also allow 'struct Name;' forward declaration. This prevents parse loops but
    // does not fully implement struct semantics; calls to struct methods will return null.
    if (atVal(T.IDENT,'struct')) {
      pos++;
      if (at(T.IDENT)) {
        const sname = cur().value;
        pos++;
        TYPE_NAMES.add(sname);
        if (at(T.LBRACE)) {
          // Skip balanced braces
          let depth = 0;
          eat(T.LBRACE); depth = 1;
          while (depth > 0 && !at(T.EOF)) {
            if (at(T.LBRACE)) { depth++; pos++; continue; }
            if (at(T.RBRACE)) { depth--; pos++; continue; }
            pos++;
          }
        }
        tryEat(T.SEMI);
        return null; // treat as no-op
      }
      // malformed struct — eat to next semicolon to avoid loops
      while (!at(T.SEMI) && !at(T.EOF)) pos++;
      tryEat(T.SEMI);
      return null;
    }

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

    // Check for foreach syntax: for (type var : expr) — also type[] and type[][]
    if (isTypeName()) {
      // Skip past any []/[][] after the type to check for IDENT COLON
      let k = 1;
      while (peekType(k) === T.LBRACKET && peekType(k+1) === T.RBRACKET) k += 2;
      if (peekType(k) === T.IDENT && peekType(k+1) === T.COLON) {
        let elemType = eat(T.IDENT).value;
        while (at(T.LBRACKET) && peekType(1) === T.RBRACKET) { pos += 2; elemType += '[]'; }
        const elemName = eat(T.IDENT).value;
        eat(T.COLON);
        const iterExpr = parseExpr();
        eat(T.RPAREN);
        const body = parseStatement();
        return {type:'ForEachStmt', elemType, elemName, iter: iterExpr, body, line: ln};
      }
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
    // operator-- / operator.. / operator+ etc. used as callable: operator--(pts)
    if (t.type === T.LPAREN && left.type === 'OperatorLit') {
      return parseFuncCallNode(left, ln);
    }

    // Array access / array slice
    if (t.type === T.LBRACKET) {
      pos++;
      // a[:]  a[:end]  a[start:]  a[start:end]
      if (at(T.COLON)) {
        pos++;
        let endE = null;
        if (!at(T.RBRACKET)) endE = parseExpr();
        eat(T.RBRACKET);
        return {type:'ArraySlice', object:left, start:null, end:endE, line:ln};
      }
      const idx = parseExpr();
      if (at(T.COLON)) {
        pos++;
        let endE = null;
        if (!at(T.RBRACKET)) endE = parseExpr();
        eat(T.RBRACKET);
        return {type:'ArraySlice', object:left, start:idx, end:endE, line:ln};
      }
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
      // Spread: ...expr — expand array into individual args at call time
      if (at(T.DOTDOTDOT)) {
        const spLn = cur().line;
        pos++;
        args.push({type:'SpreadArg', value: parseExpr(), line: spLn});
      }
      // Support named parameters: name=value
      else if (at(T.IDENT) && pos+1 < tokens.length && tokens[pos+1].type === T.ASSIGN) {
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

      // Check for explicit controls: ..controls c1 and c2..
      // Parser-level support: consume the controls clause; currently the controls
      // themselves are ignored (Hobby's algorithm produces the curve).
      let controlsOut = null, controlsIn = null;
      if (atVal(T.IDENT, 'controls')) {
        pos++;
        controlsOut = parseExpr(5.5);
        if (atVal(T.IDENT, 'and')) {
          pos++;
          controlsIn = parseExpr(5.5);
        } else {
          controlsIn = controlsOut;
        }
        if (at(T.DOTDOT)) pos++;
        // After controls block, next token may be 'cycle' to close path
        if (atVal(T.IDENT, 'cycle')) {
          pos++;
          nodes[nodes.length-1].join = join;
          nodes[nodes.length-1].controlsOut = controlsOut;
          nodes.push({point: Identifier('cycle', cur().line), join: null, isCycle: true, controlsIn: controlsIn});
          break;
        }
      }

      // Check for incoming direction {dir}
      const dirIn = tryParseDir();

      const point = parseExpr(5.5); // parse at path-join level so +/- bind tighter than --/..
      nodes[nodes.length-1].join = join;
      nodes[nodes.length-1].tension = tension;
      nodes[nodes.length-1].controlsOut = controlsOut;
      const newNode = {point, join: null, dirIn: dirIn, controlsIn: controlsIn};

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
      const numNode = NumberLit(t.value, ln, t.isInt);
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
    fontsize:12, opacity:1, linecap:null, linejoin:null, fillrule:null, _lwExplicit:false, fontFamily:null}, props);
}
function makeTransform(a,b,c,d,e,f) { return {_tag:'transform',a,b,c,d,e,f}; }
function makePath(segs, closed) { return {_tag:'path', segs: segs||[], closed:!!closed}; }
// seg = {p0:{x,y}, cp1:{x,y}, cp2:{x,y}, p3:{x,y}}
function makeSeg(p0,cp1,cp2,p3) { return {p0,cp1,cp2,p3}; }
function lineSegment(a,b) {
  // If either endpoint is a triple, keep control points as triples so
  // projectPathTriples() can project them correctly later.
  if ((a && a._tag === 'triple') || (b && b._tag === 'triple')) {
    const az = a.z || 0, bz = b.z || 0;
    return makeSeg(a,
      {_tag:'triple', x:a.x+(b.x-a.x)/3, y:a.y+(b.y-a.y)/3, z:az+(bz-az)/3},
      {_tag:'triple', x:a.x+2*(b.x-a.x)/3, y:a.y+2*(b.y-a.y)/3, z:az+2*(bz-az)/3},
      b);
  }
  return makeSeg(a, {x:a.x+(b.x-a.x)/3,y:a.y+(b.y-a.y)/3}, {x:a.x+2*(b.x-a.x)/3,y:a.y+2*(b.y-a.y)/3}, b);
}

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
function isGraphic(v) { return v && v._tag === 'graphic'; }

// Inversion type (non-affine transform from geometry module)
function makeInversion(k, center) { return {_tag:'inversion', k, center}; }
function isInversion(v) { return v && v._tag === 'inversion'; }
function applyInversion(inv, p) {
  // Circle inversion: P' = C + k / |P - C|^2 * (P - C)
  const dx = p.x - inv.center.x, dy = p.y - inv.center.y;
  const d2 = dx*dx + dy*dy;
  if (d2 < 1e-30) return makePair(p.x, p.y); // degenerate: point at center
  const s = inv.k / d2;
  return makePair(inv.center.x + s * dx, inv.center.y + s * dy);
}

// Geometry package types
function makeCoordSys(O, i, j) {
  // O, i, j are pairs in default coordinates
  // Build the 2×2 matrix P = [i | j] and its inverse
  const det = i.x * j.y - i.y * j.x;
  const idet = det !== 0 ? 1 / det : 0;
  const iPxx = j.y * idet, iPxy = -j.x * idet;
  const iPyx = -i.y * idet, iPyy = i.x * idet;
  return {
    _tag: 'coordsys',
    O: O, i: i, j: j,
    relativeToDefault: function(p) {
      return makePair(O.x + p.x * i.x + p.y * j.x, O.y + p.x * i.y + p.y * j.y);
    },
    defaultToRelative: function(p) {
      const dx = p.x - O.x, dy = p.y - O.y;
      return makePair(iPxx * dx + iPxy * dy, iPyx * dx + iPyy * dy);
    },
  };
}
function isCoordSys(v) { return v && v._tag === 'coordsys'; }

function makePoint(R, coords, mass) {
  return { _tag: 'point', coordsys: R, coordinates: coords, x: coords.x, y: coords.y, m: mass || 1 };
}
function isPoint(v) { return v && v._tag === 'point'; }

function locatePoint(P) { return P.coordsys.relativeToDefault(P.coordinates); }

function makeGeoVector(R, coords) {
  return { _tag: 'vector', v: makePoint(R, coords, 1) };
}
function isGeoVector(v) { return v && v._tag === 'vector'; }

function locateVector(v) {
  // Vector is displacement only — subtract origin
  const p = locatePoint(v.v);
  const O = v.v.coordsys.O;
  return makePair(p.x - O.x, p.y - O.y);
}

// Geometry line type
function makeGeoLine(A, B, extendA, extendB) {
  // A, B are points; extendA/B control ray/segment/line
  return { _tag: 'geoline', A: A, B: B, extendA: extendA !== false, extendB: extendB !== false };
}
function isGeoLine(v) { return v && v._tag === 'geoline'; }

function makeSegment(A, B) {
  return makeGeoLine(A, B, false, false);
}

// Geometry circle type
function makeGeoCircle(C, r) {
  return { _tag: 'geocircle', C: C, r: r };
}
function isGeoCircle(v) { return v && v._tag === 'geocircle'; }

// Geometry triangle type
function makeTriangleGeo(A, B, C) {
  return { _tag: 'geotriangle', A: A, B: B, C: C };
}
function isTriangleGeo(v) { return v && v._tag === 'geotriangle'; }

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
      // Both have color: add RGB then proportionally scale if saturated
      // (Asymptote's rgbrange() divides all components by the max, preserving hue)
      r.r = a.r + b.r;
      r.g = a.g + b.g;
      r.b = a.b + b.b;
      const sat = Math.max(r.r, r.g, r.b);
      if (sat > 1) { const s = 1 / sat; r.r *= s; r.g *= s; r.b *= s; }
    } else {
      r.r = b.r; r.g = b.g; r.b = b.b;
    }
  }
  if (b.linewidth !== 0.5) r.linewidth = b.linewidth;
  if (b._lwExplicit) r._lwExplicit = true;
  if (b._lwDirect) r._lwDirect = true;
  if (b.linestyle) r.linestyle = b.linestyle;
  if (b.fontsize !== 12) r.fontsize = b.fontsize;
  if (b.opacity !== 1) r.opacity = b.opacity;
  if (b.linecap) r.linecap = b.linecap;
  if (b.linejoin) r.linejoin = b.linejoin;
  if (b.fillrule) r.fillrule = b.fillrule;
  if (b.fontFamily) r.fontFamily = b.fontFamily;
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
  // t1 * t2 means: apply t2 first, then t1 (right-to-left like matrix multiplication)
  // result(x) = t1(t2(x))
  // T = [b c; e f] translation [a; d]
  // For pair (x,y): T(x,y) = (a + bx + cy, d + ex + fy)
  return makeTransform(
    t1.a + t1.b*t2.a + t1.c*t2.d,
    t1.b*t2.b + t1.c*t2.e,
    t1.b*t2.c + t1.c*t2.f,
    t1.d + t1.e*t2.a + t1.f*t2.d,
    t1.e*t2.b + t1.f*t2.e,
    t1.e*t2.c + t1.f*t2.f
  );
}

// ============================================================
// transform3 — true 4x4 affine transforms for 3D operations.
// Stored as {_tag:'transform3', m: [16 floats] (row-major)}.
// Row-major means m[row*4+col]; applying T to column-vector v gives
//   v'[r] = sum_c m[r*4+c] * v[c]  (with v[3]=1).
// Composition: (t1*t2).m = matMul(t1.m, t2.m).
// ============================================================
function isTransform3(v) { return v && v._tag === 'transform3'; }
function makeTransform3(m) { return {_tag:'transform3', m: m.slice()}; }
function identityT3() {
  return makeTransform3([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function shiftT3(tx, ty, tz) {
  return makeTransform3([1,0,0,tx, 0,1,0,ty, 0,0,1,tz, 0,0,0,1]);
}
function scaleT3(sx, sy, sz) {
  if (sy === undefined) sy = sx;
  if (sz === undefined) sz = sx;
  return makeTransform3([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1]);
}
function rotateT3(angleDeg, axis) {
  // Rotation around axis through origin. axis is a triple.
  const nx = axis.x, ny = axis.y, nz = axis.z;
  const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
  if (len < 1e-12) return identityT3();
  const ux = nx/len, uy = ny/len, uz = nz/len;
  const th = angleDeg * Math.PI / 180;
  const c = Math.cos(th), s = Math.sin(th), C = 1-c;
  // Rodrigues' formula
  return makeTransform3([
    c + ux*ux*C,     ux*uy*C - uz*s, ux*uz*C + uy*s, 0,
    uy*ux*C + uz*s,  c + uy*uy*C,    uy*uz*C - ux*s, 0,
    uz*ux*C - uy*s,  uz*uy*C + ux*s, c + uz*uz*C,    0,
    0,               0,              0,              1
  ]);
}
function rotateT3Line(angleDeg, p, q) {
  // Rotation around line from p to q: shift(-p) then rotate around q-p then shift(+p).
  const axis = {x: q.x-p.x, y: q.y-p.y, z: q.z-p.z};
  return composeTransform3(
    shiftT3(p.x, p.y, p.z),
    composeTransform3(rotateT3(angleDeg, axis),
      shiftT3(-p.x, -p.y, -p.z)));
}
function composeTransform3(t1, t2) {
  const a = t1.m, b = t2.m, r = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[i*4+j] = a[i*4]*b[j] + a[i*4+1]*b[4+j] + a[i*4+2]*b[8+j] + a[i*4+3]*b[12+j];
    }
  }
  return makeTransform3(r);
}
function applyTransform3Triple(t, v) {
  const m = t.m;
  return {_tag:'triple',
    x: m[0]*v.x + m[1]*v.y + m[2]*v.z + m[3],
    y: m[4]*v.x + m[5]*v.y + m[6]*v.z + m[7],
    z: m[8]*v.x + m[9]*v.y + m[10]*v.z + m[11]};
}
function applyTransform3Path(t, path) {
  // Apply to any triple control points in a path (2D points are passed through
  // as triples with z=0 if needed; but here we only touch segs whose endpoints
  // are triples — flat 2D paths are left alone).
  const newSegs = path.segs.map(s => {
    const nP0 = (s.p0 && s.p0._tag === 'triple') ? applyTransform3Triple(t, s.p0) : s.p0;
    const nP1 = (s.cp1 && s.cp1._tag === 'triple') ? applyTransform3Triple(t, s.cp1) : s.cp1;
    const nP2 = (s.cp2 && s.cp2._tag === 'triple') ? applyTransform3Triple(t, s.cp2) : s.cp2;
    const nP3 = (s.p3 && s.p3._tag === 'triple') ? applyTransform3Triple(t, s.p3) : s.p3;
    return makeSeg(nP0, nP1, nP2, nP3);
  });
  const np = makePath(newSegs, path.closed);
  if (path._singlePoint && path._singlePoint._tag === 'triple') {
    np._singlePoint = applyTransform3Triple(t, path._singlePoint);
  } else if (path._singlePoint) {
    np._singlePoint = path._singlePoint;
  }
  return np;
}

// ============================================================
// 3D Mesh (faces of triples with face normals) — Phase 1
// ============================================================
function isMesh(v) { return v && v._tag === 'mesh'; }
function makeMesh(faces) { return {_tag:'mesh', faces: faces || []}; }
function faceNormal(face) {
  // Newell's method for robust normal of possibly non-planar polygon
  const V = face.vertices;
  const n = V.length;
  if (n < 3) return {x:0, y:0, z:1};
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const a = V[i], b = V[(i+1) % n];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const L = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  return {x: nx/L, y: ny/L, z: nz/L};
}
function applyTransform3Mesh(t, mesh) {
  const newFaces = mesh.faces.map(f => {
    const newVerts = f.vertices.map(v => applyTransform3Triple(t, v));
    const nf = {vertices: newVerts};
    if (f.pen) nf.pen = f.pen;
    nf.normal = faceNormal(nf); // recompute normal after transform
    return nf;
  });
  return makeMesh(newFaces);
}

// ---- Mesh builders for primitive solids ----

function _mkFace(verts) {
  const f = {vertices: verts.map(v => ({_tag:'triple', x:v.x, y:v.y, z:v.z}))};
  f.normal = faceNormal(f);
  return f;
}

function _buildSquareMesh() {
  // unitsquare3: (0,0,0)-(1,0,0)-(1,1,0)-(0,1,0)
  const V = [
    {x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:1,y:1,z:0}, {x:0,y:1,z:0}
  ];
  return {_tag:'mesh', faces: [_mkFace(V)]};
}

function _buildCubeMesh() {
  // unitcube: 6 faces, [0,1]^3 in Asymptote convention
  const a = {x:0,y:0,z:0}, b = {x:1,y:0,z:0}, c = {x:1,y:1,z:0}, d = {x:0,y:1,z:0};
  const e = {x:0,y:0,z:1}, f = {x:1,y:0,z:1}, g = {x:1,y:1,z:1}, h = {x:0,y:1,z:1};
  return {_tag:'mesh', faces: [
    _mkFace([a,b,c,d]),   // bottom  (normal -Z)
    _mkFace([e,h,g,f]),   // top     (normal +Z)
    _mkFace([a,e,f,b]),   // front   (normal -Y)
    _mkFace([b,f,g,c]),   // right   (normal +X)
    _mkFace([c,g,h,d]),   // back    (normal +Y)
    _mkFace([d,h,e,a]),   // left    (normal -X)
  ]};
}

function _buildSphereMesh(nLon, nLat) {
  // Unit sphere at origin, radius 1
  const faces = [];
  for (let j = 0; j < nLat; j++) {
    const phi1 = -Math.PI/2 + Math.PI * j / nLat;
    const phi2 = -Math.PI/2 + Math.PI * (j+1) / nLat;
    const z1 = Math.sin(phi1), r1 = Math.cos(phi1);
    const z2 = Math.sin(phi2), r2 = Math.cos(phi2);
    for (let i = 0; i < nLon; i++) {
      const th1 = 2*Math.PI * i / nLon;
      const th2 = 2*Math.PI * (i+1) / nLon;
      const a = {x: r1*Math.cos(th1), y: r1*Math.sin(th1), z: z1};
      const b = {x: r1*Math.cos(th2), y: r1*Math.sin(th2), z: z1};
      const c = {x: r2*Math.cos(th2), y: r2*Math.sin(th2), z: z2};
      const d = {x: r2*Math.cos(th1), y: r2*Math.sin(th1), z: z2};
      // Skip degenerate at poles (triangle instead of quad)
      if (j === 0) { faces.push(_mkFace([a, c, d])); }
      else if (j === nLat-1) { faces.push(_mkFace([a, b, c])); }
      else { faces.push(_mkFace([a, b, c, d])); }
    }
  }
  return {_tag:'mesh', faces};
}

function _buildCylinderMesh(nLon) {
  // Unit cylinder: radius 1, base at z=0, top at z=1
  const faces = [];
  // Side
  for (let i = 0; i < nLon; i++) {
    const th1 = 2*Math.PI * i / nLon;
    const th2 = 2*Math.PI * (i+1) / nLon;
    const a = {x: Math.cos(th1), y: Math.sin(th1), z: 0};
    const b = {x: Math.cos(th2), y: Math.sin(th2), z: 0};
    const c = {x: Math.cos(th2), y: Math.sin(th2), z: 1};
    const d = {x: Math.cos(th1), y: Math.sin(th1), z: 1};
    faces.push(_mkFace([a, b, c, d]));
  }
  // Bottom cap: fan from origin
  for (let i = 0; i < nLon; i++) {
    const th1 = 2*Math.PI * i / nLon;
    const th2 = 2*Math.PI * (i+1) / nLon;
    const center = {x: 0, y: 0, z: 0};
    const a = {x: Math.cos(th2), y: Math.sin(th2), z: 0};
    const b = {x: Math.cos(th1), y: Math.sin(th1), z: 0};
    faces.push(_mkFace([center, a, b]));
  }
  // Top cap
  for (let i = 0; i < nLon; i++) {
    const th1 = 2*Math.PI * i / nLon;
    const th2 = 2*Math.PI * (i+1) / nLon;
    const center = {x: 0, y: 0, z: 1};
    const a = {x: Math.cos(th1), y: Math.sin(th1), z: 1};
    const b = {x: Math.cos(th2), y: Math.sin(th2), z: 1};
    faces.push(_mkFace([center, a, b]));
  }
  return {_tag:'mesh', faces};
}

function _buildConeMesh(nLon) {
  // Unit cone: apex at (0,0,1), base circle radius 1 at z=0
  const faces = [];
  const apex = {x:0, y:0, z:1};
  const center = {x:0, y:0, z:0};
  // Side faces
  for (let i = 0; i < nLon; i++) {
    const th1 = 2*Math.PI * i / nLon;
    const th2 = 2*Math.PI * (i+1) / nLon;
    const a = {x: Math.cos(th1), y: Math.sin(th1), z: 0};
    const b = {x: Math.cos(th2), y: Math.sin(th2), z: 0};
    faces.push(_mkFace([apex, a, b]));
  }
  // Base cap
  for (let i = 0; i < nLon; i++) {
    const th1 = 2*Math.PI * i / nLon;
    const th2 = 2*Math.PI * (i+1) / nLon;
    const a = {x: Math.cos(th2), y: Math.sin(th2), z: 0};
    const b = {x: Math.cos(th1), y: Math.sin(th1), z: 0};
    faces.push(_mkFace([center, a, b]));
  }
  return {_tag:'mesh', faces};
}

function _buildDiskMesh(nLon) {
  // Unit disk in z=0 plane, radius 1
  const faces = [];
  const center = {x:0, y:0, z:0};
  for (let i = 0; i < nLon; i++) {
    const th1 = 2*Math.PI * i / nLon;
    const th2 = 2*Math.PI * (i+1) / nLon;
    const a = {x: Math.cos(th1), y: Math.sin(th1), z: 0};
    const b = {x: Math.cos(th2), y: Math.sin(th2), z: 0};
    faces.push(_mkFace([center, a, b]));
  }
  return {_tag:'mesh', faces};
}

// ============================================================
// Hobby's Algorithm for smooth '..' paths
// ============================================================

function hobbySpline(knots, closed, directions) {
  const n = knots.length;
  if (n < 2) return [];
  if (n === 2) {
    // Simple case: single segment with default smooth tangents
    const dOut = directions && directions[0] ? directions[0].dirOut : null;
    const dIn = directions && directions[1] ? directions[1].dirIn : null;
    return [hobbyTwoPointSegment(knots[0], knots[1], dOut, dIn)];
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

  // Build clamped theta array from direction constraints.
  // For knot i, if a direction is specified, we compute the desired theta[i]
  // (offset of tangent from chord) and mark it as clamped.
  // dirOut of knot i constrains the outgoing tangent at knot i → theta[i].
  // dirIn of knot i constrains the incoming tangent at knot i → phi at knot i-1 side,
  //   but it is easier to express as theta[i] relative to the incoming chord.
  // We combine: if dirOut is set, that directly gives theta. If only dirIn is set and
  // dirOut is not, we convert it to an equivalent theta constraint.
  const clampedTheta = new Array(n).fill(null);
  if (directions) {
    for (let i = 0; i < n; i++) {
      const dir = directions[i];
      if (!dir) continue;
      if (dir.dirOut != null) {
        // theta[i] = dirOut - delta[i] (outgoing chord angle at i)
        let th = dir.dirOut - delta[i % m];
        while (th > Math.PI) th -= 2*Math.PI;
        while (th < -Math.PI) th += 2*Math.PI;
        clampedTheta[i] = th;
      } else if (dir.dirIn != null && !closed) {
        // For an interior knot with only dirIn: the incoming tangent at knot i
        // should be dir.dirIn. The incoming tangent angle = delta[i-1] - phi[i-1].
        // Using the relation phi[i-1] = -psi[i] - theta[i], we get:
        // incoming angle = delta[i-1] + psi[i] + theta[i]
        // Setting this equal to dirIn gives theta[i] = dirIn - delta[i-1] - psi[i].
        // But it's simpler to just treat dirIn as constraining the outgoing direction
        // at knot i to the same angle (smooth through the knot).
        if (i > 0 && i < n-1) {
          let th = dir.dirIn - delta[i % m];
          while (th > Math.PI) th -= 2*Math.PI;
          while (th < -Math.PI) th += 2*Math.PI;
          clampedTheta[i] = th;
        } else if (i === n-1) {
          // Last knot: dirIn constrains the incoming tangent at the endpoint.
          // theta[n-1] relates to the incoming side: incoming angle = delta[n-2] + psi[n-1] + theta[n-1]
          // We want incoming angle + PI = dirIn (direction of arrival), so
          // incoming angle = dirIn + PI (since dirIn points inward).
          // Actually: the incoming tangent at knot n-1 points from cp2 to p3,
          // i.e. angle = delta[m-1] - phi[m-1] = delta[m-1] + psi[n-1] + theta[n-1].
          // We want it to equal dirIn, so:
          // theta[n-1] = dirIn - delta[m-1] - psi[n-1]
          let th = dir.dirIn - delta[m-1] - psi[n-1];
          while (th > Math.PI) th -= 2*Math.PI;
          while (th < -Math.PI) th += 2*Math.PI;
          clampedTheta[n-1] = th;
        }
      }
    }
  }

  // Solve for theta (tangent angle offsets at each knot)
  const theta = new Array(n).fill(0);
  const phi = new Array(n).fill(0);

  if (closed) {
    // Cyclic tridiagonal system
    solveCyclicTridiag(n, d, psi, theta, clampedTheta);
  } else {
    // Open: natural end conditions (theta[0]=0 approx, theta[n-1]=0)
    solveOpenTridiag(n, d, psi, theta, clampedTheta);
  }

  // Override phi for knots where dirIn is specified (incoming tangent constraint)
  // This handles the case where dirIn constrains the incoming control point
  // independently from the outgoing direction.
  if (directions) {
    for (let i = 0; i < m; i++) {
      const j = (i+1) % n;
      phi[i] = -psi[j] - theta[j];
      // If next knot has dirIn, override phi to match
      const dirJ = directions[j];
      if (dirJ && dirJ.dirIn != null && dirJ.dirOut != null && dirJ.dirIn !== dirJ.dirOut) {
        // Both dirIn and dirOut specified and different: phi controls incoming angle
        // phi[i] = delta[i] - dirIn + PI, normalized
        let p = delta[i] - dirJ.dirIn + Math.PI;
        while (p > Math.PI) p -= 2*Math.PI;
        while (p < -Math.PI) p += 2*Math.PI;
        phi[i] = p;
      }
    }
  } else {
    // Compute phi from theta and psi (original code)
    for (let i = 0; i < m; i++) {
      const j = (i+1) % n;
      phi[i] = -psi[j] - theta[j];
    }
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
  const c3 = 0.5 * (Math.sqrt(5) - 1);
  const d3 = 0.5 * (3 - Math.sqrt(5));
  const den = 1 + c3 * ct + d3 * cp;
  return Math.max(0.1, num / den);
}

function hobbyTwoPointSegment(a, b, dirOut, dirIn) {
  // Default smooth tangents for two-point spline
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.sqrt(dx*dx + dy*dy);
  const chordAngle = Math.atan2(dy, dx);
  const angleA = (dirOut != null) ? dirOut : chordAngle;
  const angleB = (dirIn != null) ? dirIn : chordAngle;
  // Compute theta/phi offsets from chord for Hobby's rho function
  const thetaA = angleA - chordAngle;
  const phiB = chordAngle - angleB + Math.PI;
  // Normalize to [-pi, pi]
  const normAngle = v => { while (v > Math.PI) v -= 2*Math.PI; while (v < -Math.PI) v += 2*Math.PI; return v; };
  const theta = normAngle(thetaA);
  const phi = normAngle(phiB);
  const alpha = hobbyRho(theta, phi) * d / 3;
  const beta = hobbyRho(phi, theta) * d / 3;
  return makeSeg(a,
    {x: a.x + alpha*Math.cos(angleA), y: a.y + alpha*Math.sin(angleA)},
    {x: b.x - beta*Math.cos(angleB), y: b.y - beta*Math.sin(angleB)},
    b
  );
}

function solveOpenTridiag(n, d, psi, theta, clampedTheta) {
  if (n <= 2) { theta[0] = 0; if(n>1) theta[1] = 0; return; }
  const m = n - 1;
  // Build tridiagonal: A[i]*theta[i-1] + B[i]*theta[i] + C[i]*theta[i+1] = D[i]
  const A = new Array(n).fill(0), B = new Array(n).fill(0);
  const C = new Array(n).fill(0), D = new Array(n).fill(0);

  // Natural end conditions with curl=1 (Hobby's default)
  B[0] = 1; C[0] = 1; D[0] = -psi[1];
  for (let i = 1; i < m; i++) {
    const di_1 = d[i-1] || 1, di = d[i] || 1;
    A[i] = 1/di_1;
    B[i] = (2*di_1 + 2*di) / (di_1 * di);
    C[i] = 1/di;
    D[i] = -(2*psi[i]*di + psi[i+1]*di_1) / (di_1 * di);
  }
  B[m] = 1; A[m] = 1; D[m] = 0;

  // Apply clamped theta constraints: replace row with identity equation
  if (clampedTheta) {
    for (let i = 0; i < n; i++) {
      if (clampedTheta[i] != null) {
        A[i] = 0; B[i] = 1; C[i] = 0; D[i] = clampedTheta[i];
      }
    }
  }

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

function solveCyclicTridiag(n, d, psi, theta, clampedTheta) {
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

  // Apply clamped theta constraints: replace row with identity equation
  if (clampedTheta) {
    for (let i = 0; i < n; i++) {
      if (clampedTheta[i] != null) {
        A[i] = 0; B[i] = 1; C[i] = 0; D[i] = clampedTheta[i];
      }
    }
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

// Raw 3D→2D projection (module-scope so both interpreter and renderer can use it)
function _projectTripleRaw(v, proj) {
  const cx = proj.cx, cy = proj.cy, cz = proj.cz;
  const tx = proj.tx || 0, ty = proj.ty || 0, tz = proj.tz || 0;
  // Direction from target to camera (view direction in Asymptote convention)
  const dx = cx-tx, dy = cy-ty, dz = cz-tz;
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
  const fw = {x:dx/dist, y:dy/dist, z:dz/dist};
  const ux = proj.ux || 0, uy = proj.uy || 0, uz = proj.uz || 1;
  let rx = uy*fw.z - uz*fw.y, ry = uz*fw.x - ux*fw.z, rz = ux*fw.y - uy*fw.x;
  const rlen = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1;
  rx /= rlen; ry /= rlen; rz /= rlen;
  const upx = fw.y*rz - fw.z*ry, upy = fw.z*rx - fw.x*rz, upz = fw.x*ry - fw.y*rx;
  const px = v.x - tx, py = v.y - ty, pz = v.z - tz;

  if (proj.type === 'perspective') {
    const depth = px*fw.x + py*fw.y + pz*fw.z;
    const denom = dist - depth;
    const safeDenom = Math.abs(denom) < 0.01 * dist
      ? (denom >= 0 ? 1 : -1) * 0.01 * dist : denom;
    const scale = dist / safeDenom;
    const sx = px*rx + py*ry + pz*rz;
    const sy = px*upx + py*upy + pz*upz;
    return makePair(sx * scale, sy * scale);
  }
  const sx = px*rx + py*ry + pz*rz;
  const sy = px*upx + py*upy + pz*upz;
  return makePair(sx, sy);
}

function createInterpreter() {
  // Draw commands output
  const drawCommands = [];
  // Active picture (all drawing routes here; copied to drawCommands at end)
  let currentPic = {_tag:'picture', commands:[]};
  // 3D projection (set by import three / currentprojection = ...)
  let projection = null; // null = no 3D; {type, camera, target, up, ...}
  // Track all projected triples for camera auto-adjust (perspective adjust=true)
  // Each entry: { triple, target } where target is {obj, key} pointing to the 2D result
  let _projectedTriples = [];
  // Counter for unique per-subpicture crop clip IDs
  let _subpicClipIdCounter = 0;
  // Settings
  let unitScale = 1;       // unitsize value in points
  let hasUnitScale = false; // whether unitsize() was explicitly called
  let sizeW = 0, sizeH = 0;
  let keepAspect = true;
  let defaultPen = makePen({});
  let iterationLimit = 100000;
  let _imageCache = {};    // pre-fetched graphic() image data

  // Project a triple to a pair using the current 3D projection.
  // For perspective projections, implements Asymptote's adjust=true:
  // if a point is near/behind the camera, immediately scale the camera
  // outward and re-project all previously projected points in-place.
  function projectTriple(v) {
    if (!isTriple(v)) return isPair(v) ? v : makePair(0,0);
    const proj = projection;
    if (!proj) return makePair(v.x, v.y); // no projection: drop z

    // For perspective: implement Asymptote's adjust=Adjust behavior.
    // Ensure the camera is far enough back that the scene fits within
    // a reasonable field of view (~45 degrees).
    if (proj.type === 'perspective') {
      const tx = proj.tx || 0, ty = proj.ty || 0, tz = proj.tz || 0;
      const dx = proj.cx-tx, dy = proj.cy-ty, dz = proj.cz-tz;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
      const fwx = dx/dist, fwy = dy/dist, fwz = dz/dist;

      // Compute the lateral extent of this point (perpendicular to view axis)
      const px = v.x-tx, py = v.y-ty, pz = v.z-tz;
      const depth = px*fwx + py*fwy + pz*fwz;
      const lateralSq = (px*px + py*py + pz*pz) - depth*depth;
      const lateral = Math.sqrt(Math.max(0, lateralSq));

      // Required camera distance: lateral extent / tan(fov/2) + depth offset
      // Using fov ≈ 45 degrees, tan(22.5°) ≈ 0.4142
      const tanHalfFov = 0.4142;
      const requiredDist = lateral / tanHalfFov + depth;

      // Also ensure point is not within 50% of camera distance
      const minDistForDepth = depth > 0 ? depth / 0.5 : dist;

      const neededDist = Math.max(requiredDist, minDistForDepth);

      if (neededDist > dist * 1.01) { // need to move camera back
        const scaleFactor = neededDist / dist;
        proj.cx = tx + dx * scaleFactor;
        proj.cy = ty + dy * scaleFactor;
        proj.cz = tz + dz * scaleFactor;

        // Re-project all previously tracked triples with new camera
        for (const entry of _projectedTriples) {
          const t = entry.triple;
          const rp = _projectTripleRaw(t, proj);
          entry.result.x = rp.x;
          entry.result.y = rp.y;
        }
      }
    }

    const result = _projectTripleRaw(v, proj);
    // Track for later potential re-projection
    if (proj.type === 'perspective' || proj.center) {
      _projectedTriples.push({ triple: {x:v.x, y:v.y, z:v.z}, result });
    }
    return result;
  }

  // Transform a single draw command by an affine transform
  function transformDrawCmd(t, dc) {
    const r = Object.assign({}, dc);
    if (r.path) r.path = applyTransformPath(t, r.path);
    if (r.pos) r.pos = applyTransformPair(t, r.pos);
    // Compose picture transform into graphic's transform for image commands
    if (r.cmd === 'image' && r.graphic) {
      const existing = r.graphic.transform;
      r.graphic = Object.assign({}, r.graphic, {
        transform: existing ? composeTransforms(existing, t) : t
      });
    }
    // Preserve alignment direction (don't transform it)
    return r;
  }

  // Compute the geometric bounding box of draw commands (paths + dot positions, not labels/clips)
  function getGeoBbox(commands) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const dc of commands) {
      if (!dc || dc.cmd === 'clip' || dc.cmd === 'label') continue;
      if (dc.path) {
        for (const seg of (dc.path.segs || [])) {
          for (const p of [seg.p0, seg.cp1, seg.cp2, seg.p3]) {
            if (!p) continue;
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
          }
        }
      }
      if (dc.pos) {
        if (dc.pos.x < minX) minX = dc.pos.x; if (dc.pos.x > maxX) maxX = dc.pos.x;
        if (dc.pos.y < minY) minY = dc.pos.y; if (dc.pos.y > maxY) maxY = dc.pos.y;
      }
    }
    if (minX === Infinity) return {minX: 0, maxX: 1, minY: 0, maxY: 1};
    return {minX, maxX, minY, maxY};
  }

  // Apply a transform to all commands in a picture, returning a new picture
  function transformPicture(t, pic) {
    const newPic = {_tag:'picture', commands: pic.commands.map(c => transformDrawCmd(t, c))};
    // Propagate per-picture crop limits, transforming them to the new coordinate space
    if (pic._picLimits) {
      const pl = pic._picLimits;
      if (pl.xmin != null && pl.xmax != null && pl.ymin != null && pl.ymax != null) {
        const corners = [
          {x:pl.xmin, y:pl.ymin}, {x:pl.xmax, y:pl.ymin},
          {x:pl.xmin, y:pl.ymax}, {x:pl.xmax, y:pl.ymax}
        ].map(p => ({x: t.a + t.b*p.x + t.c*p.y, y: t.d + t.e*p.x + t.f*p.y}));
        newPic._picLimits = {
          xmin: Math.min(...corners.map(p => p.x)),
          xmax: Math.max(...corners.map(p => p.x)),
          ymin: Math.min(...corners.map(p => p.y)),
          ymax: Math.max(...corners.map(p => p.y)),
          crop: !!pl.crop
        };
      } else {
        newPic._picLimits = Object.assign({}, pl);
      }
    }
    return newPic;
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
  // _builtinFuncs: preserves built-in functions so that user variable
  // declarations (e.g. `real scale = 0.02;`) cannot permanently shadow them.
  // Asymptote allows variables and functions with the same name to coexist.
  const _builtinFuncs = new Map();
  {
    // Wrap globalEnv.set so that when a non-function overwrites a function,
    // the original function is saved in _builtinFuncs for fallback lookup.
    const origSet = globalEnv.set.bind(globalEnv);
    const origUpdate = globalEnv.update.bind(globalEnv);
    globalEnv.set = (name, val) => {
      const cur = globalEnv.get(name);
      if (typeof cur === 'function' && !_builtinFuncs.has(name)) {
        _builtinFuncs.set(name, cur);
      }
      origSet(name, val);
    };
    globalEnv.update = (name, val) => {
      const cur = globalEnv.get(name);
      if (typeof cur === 'function' && !_builtinFuncs.has(name)) {
        _builtinFuncs.set(name, cur);
      }
      return origUpdate(name, val);
    };
  }
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
      case 'ArraySlice': {
        const obj = evalNode(node.object, env);
        if (!isArray(obj)) return [];
        const n = obj.length;
        let s = node.start !== null ? Math.floor(toNumber(evalNode(node.start, env))) : 0;
        let e = node.end !== null ? Math.floor(toNumber(evalNode(node.end, env))) : n;
        if (s < 0) s = Math.max(0, n + s);
        if (e < 0) e = Math.max(0, n + e);
        if (s > n) s = n;
        if (e > n) e = n;
        if (e < s) e = s;
        return obj.slice(s, e);
      }
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
    if (typeof v === 'string') {
      // Handle unit suffixes: mm, cm, inch, in, pt
      const match = v.match(/^(-?\d*\.?\d+)\s*(mm|cm|inch|in|pt)?$/);
      if (!match) return 0;
      const num = parseFloat(match[1]);
      const unit = match[2];
      if (!unit || unit === 'pt') return num; // pt is the default unit
      if (unit === 'mm') return num * 72 / 25.4;
      if (unit === 'cm') return num * 72 / 2.54;
      if (unit === 'inch' || unit === 'in') return num * 72;
      return num;
    }
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
    if (isPoint(v)) return locatePoint(v);
    if (isGeoVector(v)) return locateVector(v);
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
    // In Asymptote: pen + real implicitly casts real to linewidth(real), then merges.
    // e.g. black+2 means black pen with linewidth 2.
    if (op === T.PLUS && isPen(left) && isNumber(right)) { return mergePens(left, makePen({linewidth:right, _lwExplicit:true})); }
    if (op === T.PLUS && isNumber(left) && isPen(right)) { return mergePens(makePen({linewidth:left, _lwExplicit:true}), right); }
    if (op === T.PLUS && isPen(left)) return mergePens(left, isPen(right) ? right : makePen({r:0,g:0,b:0}));
    if (op === T.PLUS && isPen(right)) return mergePens(isPen(left) ? left : makePen({r:0,g:0,b:0}), right);
    // number * pen = scale color (e.g. 0.9*white = light gray, .6white)
    if (op === T.STAR && isNumber(left) && isPen(right)) {
      return makePen(Object.assign({}, right, {r:left*right.r, g:left*right.g, b:left*right.b}));
    }
    if (op === T.STAR && isPen(left) && isNumber(right)) {
      return makePen(Object.assign({}, left, {r:right*left.r, g:right*left.g, b:right*left.b}));
    }

    // Geometry point/vector ops
    if (isPoint(left) || isPoint(right) || isGeoVector(left) || isGeoVector(right)) {
      // point + vector → point (shift point by vector displacement)
      if (op === T.PLUS && isPoint(left) && isGeoVector(right)) {
        const d = locateVector(right);
        const lp = locatePoint(left);
        const rp = makePair(lp.x + d.x, lp.y + d.y);
        return makePoint(left.coordsys, left.coordsys.defaultToRelative(rp), left.m);
      }
      if (op === T.PLUS && isGeoVector(left) && isPoint(right)) {
        const d = locateVector(left);
        const rp = locatePoint(right);
        const np = makePair(rp.x + d.x, rp.y + d.y);
        return makePoint(right.coordsys, right.coordsys.defaultToRelative(np), right.m);
      }
      // point - vector → point
      if (op === T.MINUS && isPoint(left) && isGeoVector(right)) {
        const d = locateVector(right);
        const lp = locatePoint(left);
        const rp = makePair(lp.x - d.x, lp.y - d.y);
        return makePoint(left.coordsys, left.coordsys.defaultToRelative(rp), left.m);
      }
      // point + pair → point (pair interpreted as coords in point's coordsys)
      if (op === T.PLUS && isPoint(left) && isPair(right)) {
        return makePoint(left.coordsys, makePair(left.x + right.x, left.y + right.y), left.m);
      }
      if (op === T.PLUS && isPair(left) && isPoint(right)) {
        return makePoint(right.coordsys, makePair(left.x + right.x, left.y + right.y), right.m);
      }
      // point - pair → point
      if (op === T.MINUS && isPoint(left) && isPair(right)) {
        return makePoint(left.coordsys, makePair(left.x - right.x, left.y - right.y), left.m);
      }
      // point - point → vector (in default coordsys)
      if (op === T.MINUS && isPoint(left) && isPoint(right)) {
        const lp = locatePoint(left), rp = locatePoint(right);
        const _defaultCS = makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
        return makeGeoVector(_defaultCS, makePair(lp.x - rp.x, lp.y - rp.y));
      }
      // point + point → point (barycentric-like addition, convert both to default)
      if (op === T.PLUS && isPoint(left) && isPoint(right)) {
        const lp = locatePoint(left), rp = locatePoint(right);
        return makePoint(left.coordsys, left.coordsys.defaultToRelative(makePair(lp.x + rp.x, lp.y + rp.y)), left.m + right.m);
      }
      // real * point → point (scale coordinates)
      if (op === T.STAR && isNumber(left) && isPoint(right)) {
        return makePoint(right.coordsys, makePair(left * right.x, left * right.y), right.m);
      }
      if (op === T.STAR && isPoint(left) && isNumber(right)) {
        return makePoint(left.coordsys, makePair(left.x * right, left.y * right), left.m);
      }
      // point / real → point
      if (op === T.SLASH && isPoint(left) && isNumber(right)) {
        return right !== 0 ? makePoint(left.coordsys, makePair(left.x / right, left.y / right), left.m) : left;
      }
      // vector + vector → vector
      if (op === T.PLUS && isGeoVector(left) && isGeoVector(right)) {
        const ld = locateVector(left), rd = locateVector(right);
        const _defaultCS = makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
        return makeGeoVector(_defaultCS, makePair(ld.x + rd.x, ld.y + rd.y));
      }
      // vector - vector → vector
      if (op === T.MINUS && isGeoVector(left) && isGeoVector(right)) {
        const ld = locateVector(left), rd = locateVector(right);
        const _defaultCS = makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
        return makeGeoVector(_defaultCS, makePair(ld.x - rd.x, ld.y - rd.y));
      }
      // real * vector → vector
      if (op === T.STAR && isNumber(left) && isGeoVector(right)) {
        return makeGeoVector(right.v.coordsys, makePair(left * right.v.x, left * right.v.y));
      }
      if (op === T.STAR && isGeoVector(left) && isNumber(right)) {
        return makeGeoVector(left.v.coordsys, makePair(left.v.x * right, left.v.y * right));
      }
      // vector / real → vector
      if (op === T.SLASH && isGeoVector(left) && isNumber(right)) {
        return right !== 0 ? makeGeoVector(left.v.coordsys, makePair(left.v.x / right, left.v.y / right)) : left;
      }
      // point == point
      if (op === T.EQ && isPoint(left) && isPoint(right)) {
        const lp = locatePoint(left), rp = locatePoint(right);
        return Math.abs(lp.x - rp.x) < 1e-10 && Math.abs(lp.y - rp.y) < 1e-10;
      }
      if (op === T.NEQ && isPoint(left) && isPoint(right)) {
        const lp = locatePoint(left), rp = locatePoint(right);
        return Math.abs(lp.x - rp.x) >= 1e-10 || Math.abs(lp.y - rp.y) >= 1e-10;
      }
      // coordsys * pair → pair (convert from R's coords to default)
      if (op === T.STAR && isCoordSys(left) && isPair(right)) {
        return left.relativeToDefault(right);
      }
      // pair / coordsys → pair (convert from default to R's coords)
      if (op === T.SLASH && isPair(left) && isCoordSys(right)) {
        return right.defaultToRelative(left);
      }
      // transform * point → point (apply transform, keep coordsys)
      if (op === T.STAR && isTransform(left) && isPoint(right)) {
        const p = locatePoint(right);
        const tp = applyTransformPair(left, p);
        return makePoint(right.coordsys, right.coordsys.defaultToRelative(tp), right.m);
      }
      // Fall through to pair ops by converting to pair
      if (isPoint(left) || isGeoVector(left) || isPoint(right) || isGeoVector(right)) {
        const lp = toPair(left), rp = toPair(right);
        if (op === T.PLUS) return makePair(lp.x + rp.x, lp.y + rp.y);
        if (op === T.MINUS) return makePair(lp.x - rp.x, lp.y - rp.y);
        if (op === T.STAR) return makePair(lp.x*rp.x - lp.y*rp.y, lp.x*rp.y + lp.y*rp.x);
        if (op === T.EQ) return Math.abs(lp.x-rp.x)<1e-10 && Math.abs(lp.y-rp.y)<1e-10;
        if (op === T.NEQ) return Math.abs(lp.x-rp.x)>=1e-10 || Math.abs(lp.y-rp.y)>=1e-10;
      }
    }

    // Array of triples broadcasting with triple/scalar (element-wise)
    {
      const _isTripleArr = a => Array.isArray(a) && a.length > 0 && a.every(v => isTriple(v));
      if (_isTripleArr(left) && isTriple(right)) {
        if (op === T.PLUS) return left.map(t => makeTriple(t.x+right.x, t.y+right.y, t.z+right.z));
        if (op === T.MINUS) return left.map(t => makeTriple(t.x-right.x, t.y-right.y, t.z-right.z));
      }
      if (isTriple(left) && _isTripleArr(right)) {
        if (op === T.PLUS) return right.map(t => makeTriple(left.x+t.x, left.y+t.y, left.z+t.z));
        if (op === T.MINUS) return right.map(t => makeTriple(left.x-t.x, left.y-t.y, left.z-t.z));
      }
      if (_isTripleArr(left) && isNumber(right)) {
        if (op === T.STAR) return left.map(t => makeTriple(t.x*right, t.y*right, t.z*right));
        if (op === T.SLASH) return right ? left.map(t => makeTriple(t.x/right, t.y/right, t.z/right)) : left.map(() => makeTriple(0,0,0));
      }
      if (isNumber(left) && _isTripleArr(right)) {
        if (op === T.STAR) return right.map(t => makeTriple(left*t.x, left*t.y, left*t.z));
      }
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

    // Numeric array broadcasting (element-wise ops for real[] arrays)
    // Only apply when the array's elements are plain numbers; arrays of pairs/triples are
    // left to the per-element op semantics.
    {
      const _isNumArr = a => Array.isArray(a) && (a.length === 0 || a.every(v => typeof v === 'number'));
      if (_isNumArr(left) && _isNumArr(right)) {
        const n = Math.min(left.length, right.length);
        const out = new Array(n);
        for (let i = 0; i < n; ++i) {
          const L = left[i], R = right[i];
          switch(op) {
            case T.PLUS: out[i] = L+R; break;
            case T.MINUS: out[i] = L-R; break;
            case T.STAR: out[i] = L*R; break;
            case T.SLASH: out[i] = R!==0 ? L/R : 0; break;
            case T.CARET: out[i] = Math.pow(L,R); break;
            case T.PERCENT: out[i] = R!==0 ? ((L%R)+R)%R : 0; break;
            default: out[i] = 0;
          }
        }
        return out;
      }
      if (_isNumArr(left) && isNumber(right)) {
        const R = right;
        switch(op) {
          case T.PLUS: return left.map(L => L+R);
          case T.MINUS: return left.map(L => L-R);
          case T.STAR: return left.map(L => L*R);
          case T.SLASH: return left.map(L => R!==0 ? L/R : 0);
          case T.CARET: return left.map(L => Math.pow(L,R));
          case T.PERCENT: return left.map(L => R!==0 ? ((L%R)+R)%R : 0);
        }
      }
      if (isNumber(left) && _isNumArr(right)) {
        const L = left;
        switch(op) {
          case T.PLUS: return right.map(R => L+R);
          case T.MINUS: return right.map(R => L-R);
          case T.STAR: return right.map(R => L*R);
          case T.SLASH: return right.map(R => R!==0 ? L/R : 0);
          case T.CARET: return right.map(R => Math.pow(L,R));
        }
      }
    }

    // transform3 * triple → triple
    if (isTransform3(left) && isTriple(right)) return applyTransform3Triple(left, right);
    // transform3 * transform3 → transform3
    if (isTransform3(left) && isTransform3(right)) return composeTransform3(left, right);
    // transform3 * path (with triples in it) → transformed path
    if (isTransform3(left) && isPath(right)) return applyTransform3Path(left, right);
    // transform3 * path3[] (array of path3)
    if (isTransform3(left) && Array.isArray(right)) {
      return right.map(r => (isPath(r) ? applyTransform3Path(left, r)
                           : isTriple(r) ? applyTransform3Triple(left, r)
                           : isMesh(r) ? applyTransform3Mesh(left, r)
                           : r));
    }
    // transform3 * mesh → transformed mesh
    if (isTransform3(left) && isMesh(right)) return applyTransform3Mesh(left, right);
    // transform3 * surface{mesh} → surface with transformed mesh, preserving grid metadata
    if (isTransform3(left) && right && right._tag === 'surface' && right.mesh) {
      const out = {_tag: 'surface', mesh: applyTransform3Mesh(left, right.mesh)};
      if (right._grid) {
        out._grid = right._grid.map(row => row.map(v => applyTransform3Triple(left, v)));
      }
      if (right._gridRows !== undefined) out._gridRows = right._gridRows;
      if (right._gridCols !== undefined) out._gridCols = right._gridCols;
      if (right._gridCyclic !== undefined) out._gridCyclic = right._gridCyclic;
      if (right._colors) out._colors = right._colors;
      return out;
    }
    // transform3 * revolution → transformed revolution (preserve grid)
    if (isTransform3(left) && right && right._tag === 'revolution') {
      const out = {_tag: 'revolution', mesh: applyTransform3Mesh(left, right.mesh)};
      if (right._grid) {
        out._grid = right._grid.map(row => row.map(v => applyTransform3Triple(left, v)));
      }
      if (right._gridRows !== undefined) out._gridRows = right._gridRows;
      if (right._gridCols !== undefined) out._gridCols = right._gridCols;
      if (right._gridCyclic !== undefined) out._gridCyclic = right._gridCyclic;
      if (right.path) out.path = right.path;
      if (right.axis) out.axis = right.axis;
      return out;
    }
    // transform3 * tube → transformed tube
    if (isTransform3(left) && right && right._tag === 'tube' && right.s) {
      const s = right.s;
      const sOut = {_tag: 'surface', mesh: applyTransform3Mesh(left, s.mesh)};
      if (s._grid) sOut._grid = s._grid.map(row => row.map(v => applyTransform3Triple(left, v)));
      if (s._gridRows !== undefined) sOut._gridRows = s._gridRows;
      if (s._gridCols !== undefined) sOut._gridCols = s._gridCols;
      if (s._gridCyclic !== undefined) sOut._gridCyclic = s._gridCyclic;
      if (s._colors) sOut._colors = s._colors;
      const centerOut = right.center ? applyTransform3Path(left, right.center) : right.center;
      return {_tag: 'tube', s: sOut, center: centerOut};
    }
    // Transform * pair
    if (isTransform(left) && isPair(right)) return applyTransformPair(left, right);
    // Inversion * pair (non-affine geometry transform)
    if (isInversion(left) && isPair(right)) return applyInversion(left, right);
    // Inversion * point (geometry module Point type)
    if (isInversion(left) && isPoint(right)) return applyInversion(left, locatePoint(right));
    // Transform * path
    if (isTransform(left) && isPath(right)) return applyTransformPath(left, right);
    // Transform * path[] → array of transformed paths (also maps other transformable items)
    if (isTransform(left) && Array.isArray(right)) {
      return right.map(v => {
        if (isPath(v)) return applyTransformPath(left, v);
        if (isPair(v)) return applyTransformPair(left, v);
        return v;
      });
    }
    // Transform * triangle (from geometry package)
    if (isTransform(left) && isTriangleGeo(right)) {
      const tA = applyTransformPair(left, locatePoint(right.A));
      const tB = applyTransformPair(left, locatePoint(right.B));
      const tC = applyTransformPair(left, locatePoint(right.C));
      const cs = right.A.coordsys;
      return makeTriangleGeo(
        makePoint(cs, cs.defaultToRelative(tA), 1),
        makePoint(cs, cs.defaultToRelative(tB), 1),
        makePoint(cs, cs.defaultToRelative(tC), 1)
      );
    }
    // Transform * point (from geometry package)
    if (isTransform(left) && isPoint(right)) {
      const p = applyTransformPair(left, locatePoint(right));
      const cs = right.coordsys;
      return makePoint(cs, cs.defaultToRelative(p), right.m);
    }
    // Transform * picture
    if (isTransform(left) && right && right._tag === 'picture') return transformPicture(left, right);
    // Transform * transform
    if (isTransform(left) && isTransform(right)) return composeTransforms(left, right);
    // Transform * graphic → graphic with composed transform
    if (isTransform(left) && isGraphic(right)) {
      const existing = right.transform;
      const t = existing ? composeTransforms(existing, left) : left;
      return Object.assign({}, right, {transform: t});
    }
    // Transform * string → Label with transform (e.g. scale(0.7)*"text", rotate(90)*"text")
    if (isTransform(left) && isString(right)) return {_tag:'label', text: right, transform: left};
    // Transform * label → label with composed transform
    if (isTransform(left) && right && right._tag === 'label') {
      const existing = right.transform;
      const t = existing ? composeTransforms(existing, left) : left;
      return Object.assign({}, right, {transform: t});
    }
    // Transform * real / real * Transform: Asymptote implicitly casts real→pair as
    // (r, 0), so e.g. rotate(th)*3.2 means rotate(th)*(3.2, 0) — a pair result.
    // (There is no standalone transform*real operator in plain.asy.)
    if (op === T.STAR && isTransform(left) && isNumber(right)) {
      return applyTransformPair(left, makePair(right, 0));
    }
    if (op === T.STAR && isNumber(left) && isTransform(right)) {
      return applyTransformPair(right, makePair(left, 0));
    }

    // String ops (concatenation, comparison)
    if (isString(left) || isString(right)) {
      if (op === T.PLUS) return String(isTriple(left)?tripleToStr(left):isPair(left)?pairToStr(left):left) + String(isTriple(right)?tripleToStr(right):isPair(right)?pairToStr(right):right);
      if (op === T.EQ) return String(left) === String(right);
      if (op === T.NEQ) return String(left) !== String(right);
      if (op === T.LT) return String(left) < String(right);
      if (op === T.GT) return String(left) > String(right);
      if (op === T.LE) return String(left) <= String(right);
      if (op === T.GE) return String(left) >= String(right);
    }

    // Number ops
    const l = toNumber(left), r = toNumber(right);
    switch(op) {
      case T.PLUS: return l+r;
      case T.MINUS: return l-r;
      case T.STAR: return l*r;
      case T.SLASH: return r!==0?l/r:0;
      case T.PERCENT: return r!==0?((l%r)+r)%r:0; // Asymptote modulo is always non-negative
      case T.HASH: return r!==0?Math.floor(l/r):0; // integer quotient
      case T.CARET: return Math.pow(l,r);
      case T.EQ: return l===r;
      case T.NEQ: return l!==r;
      case T.LT: return l<r;
      case T.GT: return l>r;
      case T.LE: return l<=r;
      case T.GE: return l>=r;
      case T.AND:
        // Path concatenation: p & q → joined path. p & cycle → closed path.
        if (isPath(left)) {
          const isRightCycle = (right && right._tag === 'cycle') ||
                               (typeof right === 'string' && right === 'cycle') ||
                               right === undefined || right === null;
          if (isRightCycle) {
            if (!left.segs.length) return left;
            const first = left.segs[0].p0;
            const last = left.segs[left.segs.length - 1].p3;
            const needClose = !first || !last ||
              Math.abs((first.x||0) - (last.x||0)) > 1e-9 ||
              Math.abs((first.y||0) - (last.y||0)) > 1e-9 ||
              Math.abs((first.z||0) - (last.z||0)) > 1e-9;
            const segs = left.segs.slice();
            if (needClose) segs.push(lineSegment(last, first));
            return makePath(segs, true);
          }
          if (isPath(right)) {
            const segs = left.segs.slice();
            // Bridge segment if endpoints don't meet
            if (segs.length > 0 && right.segs.length > 0) {
              const lend = segs[segs.length-1].p3;
              const rstart = right.segs[0].p0;
              const diff = Math.abs((lend.x||0)-(rstart.x||0)) + Math.abs((lend.y||0)-(rstart.y||0)) + Math.abs((lend.z||0)-(rstart.z||0));
              if (diff > 1e-9) segs.push(lineSegment(lend, rstart));
            }
            segs.push(...right.segs);
            return makePath(segs, !!right.closed);
          }
        }
        return toBool(left) && toBool(right);
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
      if (isPoint(v)) return makePoint(v.coordsys, makePair(-v.x, -v.y), v.m);
      if (isGeoVector(v)) return makeGeoVector(v.v.coordsys, makePair(-v.v.x, -v.v.y));
      if (isTriple(v)) return makeTriple(-v.x, -v.y, -v.z);
      if (isPair(v)) return makePair(-v.x, -v.y);
      return -toNumber(v);
    }
    if (node.op === '!') return !toBool(v);
    return v;
  }

  // Evaluate an arg list, expanding SpreadArg nodes (...arr) into element args.
  // Named args are evaluated into {_named:true, [name]:value} wrappers.
  function evalArgList(nodeArgs, env) {
    const out = [];
    for (const a of nodeArgs) {
      if (a && a.type === 'SpreadArg') {
        const v = evalNode(a.value, env);
        if (Array.isArray(v)) out.push(...v);
        else if (v != null) out.push(v);
      } else if (a && a.type === 'NamedArg') {
        const obj = {_named: true};
        obj[a.name] = evalNode(a.value, env);
        out.push(obj);
      } else {
        out.push(evalNode(a, env));
      }
    }
    return out;
  }

  function evalFuncCall(node, env) {
    // operator--(p1, p2, ...) / operator..(p1, p2, ...) — build a path connecting
    // the supplied points/paths with the given join. Mirrors Asymptote's
    // reference to path-join operators as first-class functions.
    if (node.callee.type === 'OperatorLit' &&
        (node.callee.value === '--' || node.callee.value === '..')) {
      const pts = evalArgList(node.args, env);
      const join = node.callee.value;
      const segs = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i+1];
        if (join === '--') {
          segs.push(lineSegment(a, b));
        } else {
          // ..: approximate with straight segment (Hobby would need knot sequence)
          segs.push(lineSegment(a, b));
        }
      }
      return makePath(segs, false);
    }
    // Get the callee
    let callee;
    let calleeName = '';
    if (node.callee.type === 'Identifier') {
      calleeName = node.callee.name;
      callee = env.get(calleeName);
      // Asymptote allows a variable and a function to share the same name
      // (e.g. `real scale = 0.02;` doesn't shadow `transform scale(real)`).
      // If the resolved value is not callable, fall back to the saved built-in.
      if (callee !== undefined && typeof callee !== 'function' &&
          !(callee && callee._tag === 'func')) {
        const builtin = _builtinFuncs.get(calleeName);
        if (builtin) callee = builtin;
      }
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
      const hasSpread = node.args.some(a => a && a.type === 'SpreadArg');
      const args = hasSpread ? evalArgList(node.args, env) : node.args.map(a => evalNode(a, env));
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
        // dot(point, point) or dot(vector, vector) → dot product
        if (args.length === 2 && (isPoint(args[0]) || isGeoVector(args[0])) && (isPoint(args[1]) || isGeoVector(args[1]))) {
          const a = toPair(args[0]), b = toPair(args[1]);
          return a.x*b.x + a.y*b.y;
        }
        return evalDot(args);
      }
      return evalDraw(calleeName, args);
    }

    if (typeof callee === 'function') {
      const args = evalArgList(node.args, env);
      return callee(...args);
    }
    if (callee && callee._tag === 'func') {
      // Arity-based overload: if arg count doesn't match user func params,
      // try the saved built-in (Asymptote supports same-name functions with
      // different signatures, e.g. user-defined scale(s,D,E,p) vs built-in scale(s)).
      const nArgs = node.args.filter(a => a.type !== 'NamedArg').length;
      const nParams = callee.params ? callee.params.length : 0;
      if (nArgs !== nParams && calleeName) {
        const builtin = _builtinFuncs.get(calleeName);
        if (builtin) {
          const args = node.args.map(a => evalNode(a, env));
          return builtin(...args);
        }
      }
      return callUserFunc(callee, node.args, env);
    }
    if (callee && callee._tag === 'overload') {
      // Evaluate positional args, pick best-matching alt, then dispatch.
      const positional = node.args.filter(a => a.type !== 'NamedArg');
      const posVals = positional.map(a => evalNode(a, env));
      const picked = overloadSelect(callee, posVals);
      if (picked) {
        // Reuse callUserFuncValues for positional-only; rebuild argNodes route if named args present.
        const hasNamed = node.args.some(a => a.type === 'NamedArg');
        if (!hasNamed) return callUserFuncValues(picked, posVals);
        return callUserFunc(picked, node.args, env);
      }
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

  // Check if a value is compatible with a declared Asymptote parameter type.
  // Used for type-based argument matching (e.g. disc((i,j), color) matching pair→center).
  function argMatchesParamType(val, paramType) {
    if (!paramType) return true;
    // Array types: require val to be an array; elements should be compatible with base type.
    if (paramType.endsWith('[]')) {
      if (!Array.isArray(val)) return false;
      const baseType = paramType.slice(0, -2);
      if (val.length === 0) return true;  // empty array matches any array type
      return argMatchesParamType(val[0], baseType);
    }
    switch (paramType) {
      case 'real': case 'int': return typeof val === 'number';
      case 'bool': case 'boolean': return typeof val === 'boolean';
      case 'pair': return isPair(val);
      case 'triple': return isTriple(val);
      case 'pen': return isPen(val);
      case 'path': return isPath(val);
      case 'string': return isString(val);
      case 'picture': return val && val._tag === 'picture';
      case 'transform': return val && val._tag === 'transform';
      default: return true;  // unknown type: allow anything (strict-positional fallback)
    }
  }

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
    // Pre-evaluate positional args for type-based matching
    const posVals = positional.map(a => evalNode(a, callEnv));
    const paramAssigned = new Array(params.length).fill(false);
    const argAssigned = new Array(posVals.length).fill(false);
    // Handle named args first
    for (let i = 0; i < params.length; i++) {
      if (named[params[i].name] !== undefined) {
        local.set(params[i].name, evalNode(named[params[i].name], callEnv));
        paramAssigned[i] = true;
      }
    }
    // Type-based matching: assign each positional arg to the first compatible param
    for (let ai = 0; ai < posVals.length; ai++) {
      const val = posVals[ai];
      let matched = false;
      for (let pi = 0; pi < params.length; pi++) {
        if (paramAssigned[pi]) continue;
        if (argMatchesParamType(val, params[pi].type)) {
          local.set(params[pi].name, val);
          paramAssigned[pi] = true;
          argAssigned[ai] = true;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Fallback: assign to the next unassigned param regardless of type
        for (let pi = 0; pi < params.length; pi++) {
          if (!paramAssigned[pi]) {
            local.set(params[pi].name, val);
            paramAssigned[pi] = true;
            argAssigned[ai] = true;
            break;
          }
        }
      }
    }
    // Fill remaining params with defaults or null
    for (let i = 0; i < params.length; i++) {
      if (!paramAssigned[i]) {
        if (params[i].default) {
          local.set(params[i].name, evalNode(params[i].default, local));
        } else {
          local.set(params[i].name, null);
        }
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
    if (func && func._tag === 'overload') {
      const picked = overloadSelect(func, argValues);
      if (picked) func = picked;
    }
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
    if (fn && fn._tag === 'overload') {
      const picked = overloadSelect(fn, argValues);
      if (picked) return callUserFuncValues(picked, argValues);
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

    // Surface methods (parametric surfaces, palette colouring, etc.)
    if (obj && obj._tag === 'surface') {
      if (method === 'colors') {
        obj._colors = args[0];
        return null;
      }
      if (method === 'map') {
        const fn = args[0];
        if (!fn) return [];
        const call = (t) => {
          if (typeof fn === 'function') return fn(t);
          if (fn && fn._tag === 'func') return callUserFuncValues(fn, [t]);
          return 0;
        };
        // Triangulated surface with flat vertex list (from contour3/marching tets)
        if (Array.isArray(obj._vertices)) {
          return obj._vertices.map(v => toNumber(call(v)));
        }
        // Quad-grid surface
        const grid = obj._grid;
        if (!grid) return [];
        const out = [];
        for (const row of grid) for (const v of row) out.push(toNumber(call(v)));
        return out;
      }
      if (method === 'append') {
        if (!obj.mesh) obj.mesh = makeMesh([]);
        for (const a of args) {
          if (a && a._tag === 'surface' && a.mesh) {
            obj.mesh.faces.push(...a.mesh.faces);
          } else if (isMesh(a)) {
            obj.mesh.faces.push(...a.faces);
          }
        }
        return null;
      }
      if (method === 'uequals' || method === 'vequals') {
        // Extract an iso-line curve along u= or v=; stub returns empty path.
        return makePath([], false);
      }
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
    if (obj && obj._tag === 'tube') {
      if (m === 's') return obj.s;
      if (m === 'center') return obj.center;
    }
    if (obj && obj._tag === 'surface') {
      // s.s → array of surface "patches" (for s.s[0].uequals(...) etc.)
      if (m === 's') return [obj];
      if (m === 'mesh') return obj.mesh;
    }
    if (obj && obj._tag === 'revolution' && m === 'mesh') return obj.mesh;
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
    const x = u*u*u*seg.p0.x + 3*u*u*t*seg.cp1.x + 3*u*t*t*seg.cp2.x + t*t*t*seg.p3.x;
    const y = u*u*u*seg.p0.y + 3*u*u*t*seg.cp1.y + 3*u*t*t*seg.cp2.y + t*t*t*seg.p3.y;
    // If any endpoint carries z (triple), preserve z so path3 point() returns a triple
    if (seg.p0 && seg.p0._tag === 'triple') {
      const p0z = seg.p0.z || 0;
      const c1z = (seg.cp1 && seg.cp1.z) || 0;
      const c2z = (seg.cp2 && seg.cp2.z) || 0;
      const p3z = (seg.p3 && seg.p3.z) || 0;
      const z = u*u*u*p0z + 3*u*u*t*c1z + 3*u*t*t*c2z + t*t*t*p3z;
      return makeTriple(x, y, z);
    }
    return makePair(x, y);
  }

  function evalCast(node, env) {
    const val = evalNode(node.expr, env);
    switch(node.targetType) {
      case 'int': return Math.floor(toNumber(val));
      case 'real': return toNumber(val);
      case 'string':
        if (isPair(val)) return '(' + val.x + ',' + val.y + ')';
        if (isTriple(val)) return '(' + val.x + ',' + val.y + ',' + val.z + ')';
        return String(val);
      case 'bool': return toBool(val);
      case 'pair': return toPair(val);
      default: return val;
    }
  }

  // Convert a direction AST spec ({x,y} pair or {x, singleExpr:true} angle) to radians
  function evalDirSpec(dir, env) {
    if (!dir) return null;
    if (dir.singleExpr) {
      // Single expression: interpret as degrees (e.g. {dir(225)})
      const val = evalNode(dir.x, env);
      if (isPair(val)) return Math.atan2(val.y, val.x);
      const deg = toNumber(val);
      return deg * Math.PI / 180;
    }
    const vx = toNumber(evalNode(dir.x, env));
    const vy = toNumber(evalNode(dir.y, env));
    return Math.atan2(vy, vx);
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
      const eDirIn = evalDirSpec(n.dirIn, env);
      const eDirOut = evalDirSpec(n.dirOut, env);
      if (isPath(val) && val.segs.length > 0) {
        elements.push({type:'path', segs:val.segs, join:n.join, dirIn:eDirIn, dirOut:eDirOut});
      } else if (isPath(val) && val.segs.length === 0) {
        // Empty path/guide — check if it has a _singlePoint marker (single-point path)
        if (val._singlePoint) {
          // Treat single-point path as a pair for concatenation
          const pt = isTriple(val._singlePoint) ? val._singlePoint : toPair(val._singlePoint);
          elements.push({type:'pair', pt, join:n.join, dirIn:eDirIn, dirOut:eDirOut});
        }
        // Otherwise skip entirely (truly empty path like uninitialized "guide g")
        continue;
      } else {
        // Preserve triples so path3 flows through as triple-valued segments.
        const pt = isTriple(val) ? val : toPair(val);
        elements.push({type:'pair', pt, join:n.join, dirIn:eDirIn, dirOut:eDirOut});
      }
    }

    // If any inline paths, build segments directly
    const hasInlinePaths = elements.some(e => e.type === 'path');
    if (hasInlinePaths) {
      const allSegs = [];
      let pendingPt = null; // pair waiting to be connected to next element
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        // Check if previous element used ^^ (pen-up) — if so, don't connect
        const prevJoin = i > 0 ? elements[i-1].join : '--';
        const isHatHat = prevJoin === '^^';
        if (el.type === 'path') {
          const start = el.segs[0].p0;
          // Connect from pending point or previous endpoint to start of path (unless ^^ gap)
          if (!isHatHat) {
            if (pendingPt) {
              allSegs.push(lineSegment(pendingPt, start));
              pendingPt = null;
            } else if (allSegs.length > 0) {
              const prev = allSegs[allSegs.length - 1].p3;
              if (Math.abs(prev.x - start.x) > 1e-6 || Math.abs(prev.y - start.y) > 1e-6) {
                allSegs.push(lineSegment(prev, start));
              }
            }
          } else {
            pendingPt = null; // discard pending point across ^^ gap
          }
          allSegs.push(...el.segs);
        } else {
          // pair element
          if (!isHatHat) {
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
          } else {
            // ^^ gap: start fresh from this point
            pendingPt = null;
            // Add zero-length seg to preserve point position for dot() usage
            allSegs.push(makeSeg(el.pt, el.pt, el.pt, el.pt));
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

    // Build per-knot direction constraints: {dirIn, dirOut} for each point
    const directions = elements.map(e => ({dirIn: e.dirIn || null, dirOut: e.dirOut || null}));

    // Single point: create a path with no segments but marked with _singlePoint
    // This allows the point to be used in path concatenation without adding stray segments
    if (points.length === 1) {
      const pt = points[0];
      const p = makePath([], false);
      p._singlePoint = pt; // Mark with the point for concatenation and dot rendering
      return p;
    }
    if (points.length < 1) return makePath([], false);

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
        const subDirs = directions.slice(start, hi + 1);
        if (subPoints.length >= 2) {
          const subSegs = buildPathSegs(subPoints, subJoins, false, subDirs);
          allSegs.push(...subSegs);
        } else if (subPoints.length === 1) {
          // Single point joined via ^^: zero-length segment (used by dot(a^^b^^c) to mark positions)
          allSegs.push(makeSeg(subPoints[0], subPoints[0], subPoints[0], subPoints[0]));
        }
        start = hi + 1;
      }
      return makePath(allSegs, false);
    }

    return makePath(buildPathSegs(points, joins, hasCycle, directions), hasCycle);
  }

  function buildPathSegs(points, joins, hasCycle, directions) {
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
      return hobbySpline(points, hasCycle, directions);
    }

    // Mixed joins: group consecutive '..' runs and solve each as a multi-point
    // Hobby spline (with natural curl-1 end conditions at '--' boundaries),
    // matching Asymptote's behaviour.
    const segs = [];
    const len = hasCycle ? points.length : points.length - 1;

    let i = 0;
    while (i < len) {
      if (joins[i] === '--') {
        segs.push(lineSegment(points[i], points[(i + 1) % points.length]));
        i++;
      } else {
        // Collect a contiguous run of '..' joins starting at i
        const runStart = i;
        while (i < len && joins[i] === '..') i++;
        // The run covers joins[runStart..i-1], touching points runStart..i
        // (indices mod points.length when cyclic)
        const runKnots = [];
        const runDirs = [];
        for (let k = runStart; k <= i; k++) {
          const idx = k % points.length;
          runKnots.push(points[idx]);
          runDirs.push(directions ? Object.assign({}, directions[idx]) : {dirIn: null, dirOut: null});
        }

        const runSegs = hobbySpline(runKnots, false, runDirs);
        segs.push(...runSegs);
      }
    }
    return segs;
  }

  function evalVarDecl(node, env) {
    let val = null;
    if (node.init) {
      val = evalNode(node.init, env);
      // Implicit type coercion for geometry types
      if (node.varType === 'point' && !isPoint(val)) {
        const cs = env.get('currentcoordsys') || makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
        if (isPair(val)) val = makePoint(cs, val, 1);
        else if (isGeoVector(val)) val = val.v; // vector → point
        else val = makePoint(cs, toPair(val), 1);
      } else if (node.varType === 'vector' && !isGeoVector(val)) {
        const cs = env.get('currentcoordsys') || makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
        if (isPoint(val)) val = makeGeoVector(val.coordsys, val.coordinates);
        else if (isPair(val)) val = makeGeoVector(cs, val);
        else val = makeGeoVector(cs, toPair(val));
      } else if (node.varType === 'pair' && (isPoint(val) || isGeoVector(val))) {
        val = toPair(val);
      }
    } else {
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
          case 'surface': val = {_tag:'surface', mesh: makeMesh([])}; break;
          case 'revolution': val = {_tag:'revolution', mesh: makeMesh([])}; break;
          case 'tube': val = {_tag:'tube', s: {_tag:'surface', mesh: makeMesh([])}, center: makePath([], false)}; break;
          case 'coordsys': val = makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1)); break;
          case 'point': {
            const cs = env.get('currentcoordsys') || makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
            val = makePoint(cs, makePair(0,0), 1);
            break;
          }
          case 'vector': {
            const cs = env.get('currentcoordsys') || makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
            val = makeGeoVector(cs, makePair(0,0));
            break;
          }
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
      // General object property assignment (e.g. currentlight.background)
      if (obj && typeof obj === 'object' && obj._tag && node.target.member) {
        obj[node.target.member] = val;
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
    if (node.name) {
      const existing = env.has(node.name) ? env.get(node.name) : null;
      if (existing && existing._tag === 'func') {
        env.set(node.name, {_tag:'overload', alts:[existing, func], name:node.name});
      } else if (existing && existing._tag === 'overload') {
        env.set(node.name, {_tag:'overload', alts:[...existing.alts, func], name:node.name});
      } else {
        env.set(node.name, func);
      }
    }
    return func;
  }

  // Select best-matching user function from an overload set.
  function overloadSelect(overload, posVals) {
    const alts = overload.alts;
    // Score each alt: +2 for exact type match, +1 for compatible, -1 for too-few/many params.
    let best = null, bestScore = -Infinity;
    for (const alt of alts) {
      const params = alt.params || [];
      // Count how many declared params have defaults (we don't track defaults here,
      // but params with initializer are marked via .default in parseFuncDeclBody).
      let required = 0;
      for (const p of params) if (!p.default) required++;
      if (posVals.length < required || posVals.length > params.length) continue;
      let score = 0;
      for (let i = 0; i < posVals.length; i++) {
        if (argMatchesParamType(posVals[i], params[i].type)) score += 2;
        else score -= 1;
      }
      if (score > bestScore) { bestScore = score; best = alt; }
    }
    return best || alts[alts.length - 1];
  }

  function evalImport(node, env) {
    const mod = node.module.toLowerCase();
    if (mod.includes('geometry')) {
      installGeometryPackage(env);
    }
    if (mod.includes('olympiad') || mod.includes('cse5') || mod.includes('math') || mod.includes('markers') || mod.includes('palette') || mod.includes('trembling')) {
      // Gracefully ignored — stubs/features already in stdlib or not needed for 2D rendering
    }
    if (mod.includes('contour')) {
      installContourPackage(env);
    }
    if (mod.includes('trigmacros')) {
      installGraphPackage(env); // TrigMacros depends on graph
      installTrigMacros(env);
    }
    if (mod.includes('slopefield')) {
      installSlopefieldPackage(env);
    }
    if (mod.includes('graph')) {
      installGraphPackage(env);
    }
    if (mod.includes('three') || mod.includes('solids') || mod.includes('graph3') || mod.includes('labelpath3') || mod.includes('obj') || mod.includes('smoothcontour3')) {
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
      // Grey aliases (British spelling)
      grey:'#808080',
      lightgrey:'#e6e6e6',
      mediumgrey:'#bfbfbf',
      heavygrey:'#404040',
      deepgrey:'#1a1a1a',
      darkgrey:'#0d0d0d',
      palegrey:'#f2f2f2',
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
    env.set('CCW', true);
    env.set('CW', false);
    env.set('Aspect', true);
    env.set('IgnoreAspect', false);
    env.set('nullpath', makePath([],false));
    env.set('nullpen', makePen({opacity:0}));
    env.set('currentpen', makePen({}));
    env.set('pathpen', makePen({}));
    env.set('pointpen', makePen({}));
    env.set('currentpicture', currentPic);
    env.set('currentprojection', null);
    // add() composites a picture into currentpicture (or a destination picture),
    // optionally with a transform.
    // Forms: add(src), add(dest, src), add(transform*src), add(dest, transform*src)
    env.set('add', (...args) => {
      let pics = [], t = null, pairs = [];
      for (const a of args) {
        if (a && a._tag === 'picture') pics.push(a);
        else if (isTransform(a)) t = a;
        // add(pic, (x,y)) — pair offset treated as a shift transform
        else if (isPair(a)) { pairs.push(a); t = makeTransform(a.x, 1, 0, a.y, 0, 1); }
      }
      let dest, src;
      if (pics.length >= 2) {
        dest = pics[0];
        src = pics[1];
      } else if (pics.length === 1) {
        dest = currentPic;
        src = pics[0];
      } else {
        return;
      }
      // 4-arg / 3-arg form: add(dest, src, position, align) or add(src, position, align)
      // Two pair args mean (position, align). Asymptote's picture.asy defines this as
      // placing src's bbox so its align-aligned point sits at position:
      //   shift = align + position - (m+M)/2 + rectify(align) * (M-m)/2
      // where rectify((x,y)) = (x,y)/max(|x|,|y|) (so (0,-10) → (0,-1)).
      // For |align|>1 (e.g. 10S) the magnitude adds a bp-space offset along align's
      // direction, creating a gap between composited sub-pictures.
      if (pairs.length === 2) {
        const position = pairs[0];
        const align = pairs[1];
        // If the source has per-picture size (size(pic, w)), scale its geometry into
        // _sizeW bp first, then compute bbox and shift.
        let scale = 1;
        let baseShiftX = 0, baseShiftY = 0; // pre-shift applied before bbox computation
        let scaledCmds = src.commands;
        if (src._sizeW) {
          const gb0 = getGeoBbox(src.commands);
          const geoW0 = (gb0.maxX - gb0.minX) || 1;
          scale = src._sizeW / geoW0;
          for (let _iter = 0; _iter < 3; _iter++) {
            let fullMinX = gb0.minX, fullMaxX = gb0.maxX;
            for (const dc of src.commands) {
              if (dc.cmd !== 'label') continue;
              const pos = dc.pos;
              if (!pos) continue;
              const fs = (dc.pen && dc.pen.fontsize) || 10;
              const rawTxt = typeof dc.text === 'string' ? dc.text : '';
              const cleanTxt = rawTxt.replace(/\\[a-zA-Z]+\s*/g, '').replace(/[${}]/g, '').trim();
              const twBp = _estimateTextWidth(cleanTxt || 'x', fs);
              const ax = (dc.align && dc.align.x != null) ? dc.align.x : 0;
              const dxBp = ax * (0.5 * twBp + 0.4 * fs);
              const cx = pos.x + dxBp / scale;
              const halfW = twBp / (2 * scale);
              if (cx - halfW < fullMinX) fullMinX = cx - halfW;
              if (cx + halfW > fullMaxX) fullMaxX = cx + halfW;
            }
            const fullW = (fullMaxX - fullMinX) || 1;
            scale = src._sizeW / fullW;
          }
          // Pre-scale commands so bbox below reflects bp-space geometry
          const preT = makeTransform(0, scale, 0, 0, 0, scale);
          scaledCmds = src.commands.map(c => transformDrawCmd(preT, c));
        }
        // Compute bbox of (already scaled) commands in bp space
        const gb = getGeoBbox(scaledCmds);
        const mX = gb.minX, MX = gb.maxX, mY = gb.minY, MY = gb.maxY;
        const sizeX = MX - mX, sizeY = MY - mY;
        // rectify(align): divide by max(|align.x|, |align.y|); if both zero, zero
        const aMag = Math.max(Math.abs(align.x), Math.abs(align.y));
        const rx = aMag > 0 ? align.x / aMag : 0;
        const ry = aMag > 0 ? align.y / aMag : 0;
        const shiftX = align.x + position.x - (mX + MX) / 2 + rx * sizeX / 2;
        const shiftY = align.y + position.y - (mY + MY) / 2 + ry * sizeY / 2;
        const shiftT = makeTransform(shiftX, 1, 0, shiftY, 0, 1);
        const cmds = scaledCmds.map(c => transformDrawCmd(shiftT, c));
        for (const c of cmds) dest.commands.push(c);
        if (!hasUnitScale) { hasUnitScale = true; unitScale = 1; }
        return;
      }
      // Handle per-picture sizing: add(pic.fit(), (i, 0)) where pic._sizeW is set
      // by size(pic, w). Scale the picture's geometry to _sizeW bp and shift by
      // (t.a * _sizeW, t.d * _sizeW) bp so sub-pictures are placed end-to-end.
      // The picture origin (0,0) is placed at the outer shift position; content
      // below y=0 (e.g. a sine curve) extends in the negative y direction from
      // the origin rather than being shifted up to make the bbox bottom = origin.
      if (src._sizeW && t && t.b === 1 && t.c === 0 && t.e === 0 && t.f === 1) {
        const gb = getGeoBbox(src.commands);
        const geoW = (gb.maxX - gb.minX) || 1;
        // Iteratively refine scale to fit total width (geo + label extents) into _sizeW,
        // matching Asymptote's size(p, w) which constrains the total picture width.
        let scale = src._sizeW / geoW;
        for (let _iter = 0; _iter < 3; _iter++) {
          let fullMinX = gb.minX, fullMaxX = gb.maxX;
          for (const dc of src.commands) {
            if (dc.cmd !== 'label') continue;
            const pos = dc.pos;
            if (!pos) continue;
            const fs = (dc.pen && dc.pen.fontsize) || 10;
            const rawTxt = typeof dc.text === 'string' ? dc.text : '';
            const cleanTxt = rawTxt.replace(/\\[a-zA-Z]+\s*/g, '').replace(/[${}]/g, '').trim();
            const twBp = _estimateTextWidth(cleanTxt || 'x', fs);
            const ax = (dc.align && dc.align.x != null) ? dc.align.x : 0;
            const dxBp = ax * (0.5 * twBp + 0.4 * fs);
            const cx = pos.x + dxBp / scale;
            const halfW = twBp / (2 * scale);
            if (cx - halfW < fullMinX) fullMinX = cx - halfW;
            if (cx + halfW > fullMaxX) fullMaxX = cx + halfW;
          }
          const fullW = (fullMaxX - fullMinX) || 1;
          scale = src._sizeW / fullW;
        }
        const bpShiftX = t.a * src._sizeW;
        const bpShiftY = t.d * src._sizeW;
        const newT = makeTransform(
          bpShiftX - gb.minX * scale, scale, 0,
          bpShiftY, 0, scale
        );
        const cmds = src.commands.map(c => transformDrawCmd(newT, c));
        for (const c of cmds) dest.commands.push(c);
        if (!hasUnitScale) { hasUnitScale = true; unitScale = 1; }
        return;
      }
      const cmds = t ? src.commands.map(c => transformDrawCmd(t, c)) : src.commands;
      // If the source picture has per-picture crop limits, tag each non-label
      // command with a unique clip ID so the SVG renderer can create per-subpicture
      // clip regions (not one global clip that covers only the first sub-picture).
      if (src._picLimits && src._picLimits.crop && src._picLimits.xmin != null) {
        let {xmin, xmax, ymin, ymax} = src._picLimits;
        // Apply the same transform to the clip rect corners
        if (t) {
          const corners = [
            {x: xmin, y: ymin}, {x: xmax, y: ymin},
            {x: xmin, y: ymax}, {x: xmax, y: ymax}
          ].map(p => ({x: t.a + t.b*p.x + t.c*p.y, y: t.d + t.e*p.x + t.f*p.y}));
          xmin = Math.min(...corners.map(p => p.x));
          xmax = Math.max(...corners.map(p => p.x));
          ymin = Math.min(...corners.map(p => p.y));
          ymax = Math.max(...corners.map(p => p.y));
        }
        const clipId = `subpic-crop-${_subpicClipIdCounter++}`;
        const clipRect = {xmin, xmax, ymin, ymax};
        for (const c of cmds) {
          // Labels float outside the crop region — don't clip them
          if (c.cmd !== 'label') {
            c._subpicClipId = clipId;
            c._subpicClipRect = clipRect;
          }
        }
      }
      for (const c of cmds) dest.commands.push(c);
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
    env.set('evenodd', makePen({fillrule:'evenodd'}));
    env.set('zerowinding', makePen({fillrule:'nonzero'}));

    // Units
    env.set('bp', 1);
    env.set('pt', 1);
    env.set('cm', 72 / 2.54);
    env.set('mm', 72 / 25.4);
    env.set('inch', 72);

    // Dot sizing
    env.set('dotfactor', 6);

    // Math functions — broadcast over numeric arrays (Asymptote real[] semantics)
    const _broadcast1 = (fn) => (x) => Array.isArray(x) ? x.map(v => fn(v)) : fn(toNumber(x));
    const _broadcast2 = (fn) => (a, b) => {
      const aA = Array.isArray(a), bA = Array.isArray(b);
      if (aA && bA) { const n = Math.min(a.length, b.length); const out = new Array(n); for (let i=0;i<n;++i) out[i] = fn(toNumber(a[i]), toNumber(b[i])); return out; }
      if (aA) { return a.map(v => fn(toNumber(v), toNumber(b))); }
      if (bA) { return b.map(v => fn(toNumber(a), toNumber(v))); }
      return fn(toNumber(a), toNumber(b));
    };
    // Complex sin/cos: sin(x+iy) = sin(x)cosh(y) + i*cos(x)sinh(y)
    //                  cos(x+iy) = cos(x)cosh(y) - i*sin(x)sinh(y)
    env.set('sin', (v) => {
      if (Array.isArray(v)) return v.map(x => env.get('sin')(x));
      if (isPair(v)) {
        const x = v.x, y = v.y;
        return makePair(Math.sin(x) * Math.cosh(y), Math.cos(x) * Math.sinh(y));
      }
      return Math.sin(toNumber(v));
    });
    env.set('cos', (v) => {
      if (Array.isArray(v)) return v.map(x => env.get('cos')(x));
      if (isPair(v)) {
        const x = v.x, y = v.y;
        return makePair(Math.cos(x) * Math.cosh(y), -Math.sin(x) * Math.sinh(y));
      }
      return Math.cos(toNumber(v));
    });
    env.set('tan', _broadcast1(Math.tan));
    env.set('asin', _broadcast1(Math.asin));
    env.set('acos', _broadcast1(Math.acos));
    env.set('atan', _broadcast1(Math.atan));
    env.set('atan2', _broadcast2(Math.atan2));
    env.set('sqrt', _broadcast1(Math.sqrt));
    env.set('cbrt', _broadcast1(Math.cbrt));
    env.set('sinh', _broadcast1(Math.sinh));
    env.set('cosh', _broadcast1(Math.cosh));
    env.set('tanh', _broadcast1(Math.tanh));
    env.set('asinh', _broadcast1(Math.asinh));
    env.set('acosh', _broadcast1(Math.acosh));
    env.set('atanh', _broadcast1(Math.atanh));
    env.set('abs', (x) => {
      if (isTriple(x)) return Math.sqrt(x.x*x.x + x.y*x.y + x.z*x.z);
      if (isPair(x)) return Math.sqrt(x.x*x.x + x.y*x.y);
      return Math.abs(toNumber(x));
    });

    // brace(a, b, amplitude) — curly brace path between two points
    env.set('brace', (...args) => {
      let a = null, b = null, amplitude = 0.5;
      const pairs = [];
      for (const arg of args) {
        if (isPair(arg)) pairs.push(toPair(arg));
        else if (typeof arg === 'number') amplitude = arg;
      }
      if (pairs.length >= 2) { a = pairs[0]; b = pairs[1]; }
      if (!a || !b) return makePath([], false);
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.sqrt(dx*dx + dy*dy) || 1;
      const ux = dx/L, uy = dy/L;        // unit tangent along brace axis
      const nx = -uy, ny = ux;            // unit normal (left of direction = outward tip)
      const amp = amplitude;
      // Key waypoints along the brace
      const sh1 = makePair(a.x + ux*(L*0.25) + nx*(amp*0.5), a.y + uy*(L*0.25) + ny*(amp*0.5));
      const tip = makePair(a.x + ux*(L*0.5)  + nx*amp,       a.y + uy*(L*0.5)  + ny*amp);
      const sh2 = makePair(a.x + ux*(L*0.75) + nx*(amp*0.5), a.y + uy*(L*0.75) + ny*(amp*0.5));
      const cd = L * 0.12; // control-point distance for smooth segments
      // Segment 1: A → sh1 (tangent along +u at both ends: produces a smooth curve up to shoulder)
      const c1a = makePair(a.x + ux*cd,        a.y + uy*cd);
      const c1b = makePair(sh1.x - ux*cd,      sh1.y - uy*cd);
      // Segment 2: sh1 → tip (start tangent +u, end tangent +u+n direction = cusp approach)
      const c2a = makePair(sh1.x + ux*cd,      sh1.y + uy*cd);
      const tipInX = (ux + nx) * (cd * 0.707), tipInY = (uy + ny) * (cd * 0.707);
      const c2b = makePair(tip.x - tipInX,     tip.y - tipInY);
      // Segment 3: tip → sh2 (start tangent +u-n direction = leaving cusp, end tangent +u)
      const tipOutX = (ux - nx) * (cd * 0.707), tipOutY = (uy - ny) * (cd * 0.707);
      const c3a = makePair(tip.x + tipOutX,    tip.y + tipOutY);
      const c3b = makePair(sh2.x - ux*cd,      sh2.y - uy*cd);
      // Segment 4: sh2 → B
      const c4a = makePair(sh2.x + ux*cd,      sh2.y + uy*cd);
      const c4b = makePair(b.x - ux*cd,        b.y - uy*cd);
      function sampleBezier(p0, p1, p2, p3, n, includeStart) {
        const pts = [];
        const start = includeStart ? 0 : 1;
        for (let i = start; i <= n; i++) {
          const t = i/n, mt = 1-t;
          pts.push(makePair(
            mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
            mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y
          ));
        }
        return pts;
      }
      const n = 12;
      const points = [];
      points.push(...sampleBezier(a,   c1a, c1b, sh1, n, true));
      points.push(...sampleBezier(sh1, c2a, c2b, tip, n, false));
      points.push(...sampleBezier(tip, c3a, c3b, sh2, n, false));
      points.push(...sampleBezier(sh2, c4a, c4b, b,   n, false));
      const segs = [];
      for (let i = 0; i < points.length - 1; i++) {
        segs.push(lineSegment(points[i], points[i+1]));
      }
      return makePath(segs, false);
    });
    env.set('log', _broadcast1(Math.log));
    env.set('exp', _broadcast1(Math.exp));
    env.set('log10', _broadcast1(Math.log10));
    env.set('log2', _broadcast1(Math.log2));
    env.set('pow', _broadcast2(Math.pow));
    // Euler gamma function via Lanczos approximation (g=7, n=9 coefficients)
    const _lanczosG = 7;
    const _lanczosC = [
      0.99999999999980993,
      676.5203681218851,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7,
    ];
    function _gammaReal(z) {
      if (z < 0.5) {
        // Reflection formula: Γ(z) = π / (sin(πz) Γ(1-z))
        return Math.PI / (Math.sin(Math.PI * z) * _gammaReal(1 - z));
      }
      z -= 1;
      let x = _lanczosC[0];
      for (let i = 1; i < _lanczosG + 2; i++) {
        x += _lanczosC[i] / (z + i);
      }
      const t = z + _lanczosG + 0.5;
      return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }
    env.set('gamma', _broadcast1(_gammaReal));
    function _factorialReal(n) {
      // Integer fast-path
      if (Number.isFinite(n) && n === Math.floor(n) && n >= 0 && n <= 170) {
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
      }
      // Non-integer / negative: fall back to gamma(n+1)
      return _gammaReal(n + 1);
    }
    env.set('factorial', _broadcast1(_factorialReal));
    env.set('min', (...args) => {
      if (args.length===1 && isArray(args[0])) return Math.min(...args[0].map(toNumber));
      return Math.min(...args.map(toNumber));
    });
    env.set('max', (...args) => {
      if (args.length===1 && isArray(args[0])) return Math.max(...args[0].map(toNumber));
      return Math.max(...args.map(toNumber));
    });
    env.set('floor', _broadcast1(Math.floor));
    env.set('ceil', _broadcast1(Math.ceil));
    env.set('round', _broadcast1(Math.round));
    env.set('sgn', _broadcast1(Math.sign));
    env.set('fmod', (x,y) => toNumber(x) % toNumber(y));
    env.set('degrees', (x) => {
      // Asymptote's degrees(pair) returns atan2(y,x) in (-180,180], not [0,360)
      if (isPair(x)) { return Math.atan2(x.y, x.x) * 180 / Math.PI; }
      return toNumber(x) * 180 / Math.PI;
    });
    env.set('radians', (x) => toNumber(x) * Math.PI / 180);
    env.set('Degrees', (x) => toNumber(x));  // already in degrees in Asymptote context
    env.set('Sin', _broadcast1(v => Math.sin(v*Math.PI/180)));
    env.set('Cos', _broadcast1(v => Math.cos(v*Math.PI/180)));
    env.set('Tan', _broadcast1(v => Math.tan(v*Math.PI/180)));
    env.set('aSin', _broadcast1(v => Math.asin(v)*180/Math.PI));
    env.set('aCos', _broadcast1(v => Math.acos(v)*180/Math.PI));
    env.set('aTan', _broadcast1(v => Math.atan(v)*180/Math.PI));

    // Pair functions
    env.set('dir', (...args) => {
      if (args.length === 1) {
        if (isTriple(args[0])) {
          const t = args[0];
          const len = Math.sqrt(t.x*t.x + t.y*t.y + t.z*t.z);
          return len > 0 ? makeTriple(t.x/len, t.y/len, t.z/len) : makeTriple(0,0,0);
        }
        if (isPath(args[0])) {
          return _dirOnPath(args[0], 0);
        }
        if (isPair(args[0])) {
          const p = args[0];
          const len = Math.sqrt(p.x*p.x + p.y*p.y);
          return len > 0 ? makePair(p.x/len, p.y/len) : makePair(0,0);
        }
        const a = toNumber(args[0]);
        return makePair(Math.cos(a*Math.PI/180), Math.sin(a*Math.PI/180));
      }
      if (args.length >= 2) {
        // dir(path, time)
        if (isPath(args[0])) {
          return _dirOnPath(args[0], toNumber(args[1]));
        }
        // dir(pair, pair) => unit(b - a)
        if (isPair(args[0]) && isPair(args[1])) {
          const a = args[0], b = args[1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          return len > 0 ? makePair(dx/len, dy/len) : makePair(0,0);
        }
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
    env.set('sum', (v) => {
      if (!Array.isArray(v) || v.length === 0) return 0;
      const first = v[0];
      if (isTriple(first)) {
        let x = 0, y = 0, z = 0;
        for (const t of v) {
          if (isTriple(t)) { x += t.x; y += t.y; z += t.z; }
        }
        return makeTriple(x, y, z);
      }
      if (isPair(first)) {
        let x = 0, y = 0;
        for (const t of v) {
          if (isPair(t)) { x += t.x; y += t.y; }
        }
        return makePair(x, y);
      }
      let s = 0;
      for (const t of v) s += toNumber(t);
      return s;
    });
    env.set('angle', (p) => {
      const pp = toPair(p);
      return Math.atan2(pp.y, pp.x);
    });
    env.set('conj', (p) => { const pp = toPair(p); return makePair(pp.x, -pp.y); });
    env.set('expi', (a, b) => {
      // 2D: expi(t) = (cos t, sin t)
      // 3D: expi(theta, phi) = (sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta))
      if (b !== undefined) {
        const t = toNumber(a), p = toNumber(b);
        return makeTriple(Math.sin(t)*Math.cos(p), Math.sin(t)*Math.sin(p), Math.cos(t));
      }
      const v = toNumber(a);
      return makePair(Math.cos(v), Math.sin(v));
    });
    env.set('xpart', (p) => isTriple(p) ? p.x : toPair(p).x);
    env.set('ypart', (p) => isTriple(p) ? p.y : toPair(p).y);
    env.set('zpart', (p) => isTriple(p) ? p.z : 0);
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
      // 3D form: arc(triple center, triple v1, triple v2[, int n]) —
      // spherical-great-circle arc of radius |v1-center| from v1 to v2.
      // Returns a path with triple-valued Bezier segments (path3).
      if (args.length >= 3 && isTriple(args[0]) && isTriple(args[1]) && isTriple(args[2])) {
        const c = args[0], v1 = args[1], v2 = args[2];
        const n = args.length >= 4 && typeof args[3] === 'number' ? Math.max(2, Math.floor(args[3])) : 8;
        const ux = v1.x - c.x, uy = v1.y - c.y, uz = v1.z - c.z;
        const vx = v2.x - c.x, vy = v2.y - c.y, vz = v2.z - c.z;
        const ru = Math.sqrt(ux*ux + uy*uy + uz*uz) || 1;
        const rv = Math.sqrt(vx*vx + vy*vy + vz*vz) || 1;
        const dot = (ux*vx + uy*vy + uz*vz) / (ru * rv);
        const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
        // slerp on unit vectors, scale by ru
        const samples = [];
        const nSamp = Math.max(n * 2, 16);
        for (let i = 0; i <= nSamp; i++) {
          const t = i / nSamp;
          let px, py, pz;
          if (theta < 1e-6) {
            px = c.x + (1-t)*ux + t*vx;
            py = c.y + (1-t)*uy + t*vy;
            pz = c.z + (1-t)*uz + t*vz;
          } else {
            const s1 = Math.sin((1-t)*theta) / Math.sin(theta);
            const s2 = Math.sin(t*theta) / Math.sin(theta);
            px = c.x + ru * (s1 * ux/ru + s2 * vx/rv);
            py = c.y + ru * (s1 * uy/ru + s2 * vy/rv);
            pz = c.z + ru * (s1 * uz/ru + s2 * vz/rv);
          }
          samples.push(makeTriple(px, py, pz));
        }
        const segs = [];
        for (let i = 0; i < samples.length - 1; i++) {
          segs.push(lineSegment(samples[i], samples[i+1]));
        }
        return makePath(segs, false);
      }
      // Asymptote: arc(center, radius, angle1, angle2, direction)
      // With explicit direction: CCW normalizes angle2 > angle1, CW normalizes angle2 < angle1.
      // WITHOUT explicit direction (4-arg form): direction is CCW if angle2 >= angle1, CW otherwise.
      // This matches Asymptote: arc(c,r,a1,a2) => arc(c,r,a1,a2, a2>=a1 ? CCW : CW)
      if (args.length >= 4 && !isPair(args[1])) {
        const c = toPair(args[0]);
        let r = toNumber(args[1]);
        let a1 = toNumber(args[2]), a2 = toNumber(args[3]);
        // Negative radius: draw complementary arc with |r|
        if (r < 0) {
          r = -r;
          const tmp = a1; a1 = a2; a2 = tmp;
        }
        // Determine direction: explicit 5th arg, or infer from angle relationship
        const ccw = args.length >= 5 ? !!args[4] : (a2 >= a1);
        if (ccw) { while (a2 < a1) a2 += 360; while (a2 > a1 + 360) a2 -= 360; }
        else     { while (a2 > a1) a2 -= 360; while (a2 < a1 - 360) a2 += 360; }
        return makeArcPath(c, r, a1, a2);
      }
      if (args.length >= 3 && isPair(args[1])) {
        // arc(center, point1, point2) — arc from p1 to p2 around center
        const c = toPair(args[0]);
        const p1 = toPair(args[1]), p2 = toPair(args[2]);
        const r = Math.sqrt((p1.x-c.x)*(p1.x-c.x) + (p1.y-c.y)*(p1.y-c.y));
        let a1 = Math.atan2(p1.y-c.y, p1.x-c.x) * 180 / Math.PI;
        let a2 = Math.atan2(p2.y-c.y, p2.x-c.x) * 180 / Math.PI;
        const ccw = args.length >= 4 ? !!args[3] : true;
        if (ccw) { while (a2 < a1) a2 += 360; while (a2 > a1 + 360) a2 -= 360; }
        else     { while (a2 > a1) a2 -= 360; while (a2 < a1 - 360) a2 += 360; }
        return makeArcPath(c, r, a1, a2);
      }
      if (args.length >= 2) {
        const c = toPair(args[0]);
        return makeArcPath(c, toNumber(args[1]), 0, 360);
      }
      return makePath([], false);
    });
    // Arc (uppercase, from Asymptote's graph module) is a higher-accuracy arc;
    // for our Bezier approximation the behaviour is identical to arc.
    env.set('Arc', env.get('arc'));

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
        const angle = 2*Math.PI*i/sides;
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
    // Internal helper: unit tangent direction on path at given time
    function _dirOnPath(p, t) {
      if (!isPath(p) || p.segs.length === 0) return makePair(0,0);
      const time = toNumber(t);
      // Clamp time to valid range
      const maxT = p.segs.length;
      const clamped = Math.max(0, Math.min(maxT, time));
      let i = Math.floor(clamped);
      let frac = clamped - i;
      if (i >= p.segs.length) { i = p.segs.length - 1; frac = 1; }
      const seg = p.segs[i];
      // Cubic Bezier derivative: B'(t) = 3(1-t)^2(cp1-p0) + 6(1-t)t(cp2-cp1) + 3t^2(p3-cp2)
      const u = 1 - frac;
      const dx = 3*u*u*(seg.cp1.x-seg.p0.x) + 6*u*frac*(seg.cp2.x-seg.cp1.x) + 3*frac*frac*(seg.p3.x-seg.cp2.x);
      const dy = 3*u*u*(seg.cp1.y-seg.p0.y) + 6*u*frac*(seg.cp2.y-seg.cp1.y) + 3*frac*frac*(seg.p3.y-seg.cp2.y);
      const len = Math.sqrt(dx*dx + dy*dy);
      return len > 0 ? makePair(dx/len, dy/len) : makePair(0,0);
    }

    // Internal helper for path point evaluation (avoids env.get shadowing issues)
    function _pointOnPath(p, t) {
      if (!isPath(p)) return makePair(0,0);
      if (p.segs.length === 0) return makePair(0,0);
      const time = toNumber(t);
      // time >= segs.length means the endpoint of the path
      if (time >= p.segs.length) return bezierPoint(p.segs[p.segs.length-1], 1);
      if (time <= 0) return bezierPoint(p.segs[0], 0);
      const i = Math.floor(time);
      const frac = time - i;
      const idx = Math.min(i, p.segs.length-1);
      return bezierPoint(p.segs[idx], Math.max(0, Math.min(1, frac)));
    }

    env.set('point', (p, t) => _pointOnPath(p, t));

    env.set('relpoint', (p, t) => {
      if (!isPath(p)) return makePair(0,0);
      const time = toNumber(t) * p.segs.length;
      return _pointOnPath(p, time);
    });

    // reltime(path, frac): convert arclength fraction [0,1] to path time [0,N]
    env.set('reltime', (p, t) => {
      if (!isPath(p) || p.segs.length === 0) return 0;
      return toNumber(t) * p.segs.length;
    });

    // length(path): number of segments (for path time parameterization)
    env.set('length', (v) => {
      if (isPath(v)) return v.segs.length;
      if (Array.isArray(v)) return v.length;
      if (typeof v === 'string') return v.length;
      return 0;
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
      p = geoToPath(p);
      if (!isPath(p) || p.segs.length === 0) return p;
      const ta = toNumber(a), tb = toNumber(b);
      const n = p.segs.length;
      // Clamp
      const tStart = Math.max(0, Math.min(n, ta));
      const tEnd = Math.max(0, Math.min(n, tb));
      if (tStart >= tEnd) return makePath([], false);
      const iStart = Math.floor(tStart);
      const iEnd = Math.floor(tEnd);
      const fracStart = tStart - iStart;
      const fracEnd = tEnd - iEnd;
      // de Casteljau split
      function splitSeg(seg, t) {
        const u = 1 - t;
        const a1 = {x: u*seg.p0.x + t*seg.cp1.x, y: u*seg.p0.y + t*seg.cp1.y};
        const a2 = {x: u*seg.cp1.x + t*seg.cp2.x, y: u*seg.cp1.y + t*seg.cp2.y};
        const a3 = {x: u*seg.cp2.x + t*seg.p3.x, y: u*seg.cp2.y + t*seg.p3.y};
        const b1 = {x: u*a1.x + t*a2.x, y: u*a1.y + t*a2.y};
        const b2 = {x: u*a2.x + t*a3.x, y: u*a2.y + t*a3.y};
        const c1 = {x: u*b1.x + t*b2.x, y: u*b1.y + t*b2.y};
        return [
          makeSeg(seg.p0, a1, b1, c1),
          makeSeg(c1, b2, a3, seg.p3)
        ];
      }
      const segs = [];
      if (iStart === iEnd && iStart < n) {
        // Both start and end within the same segment
        let seg = p.segs[iStart];
        if (fracStart > 1e-12) seg = splitSeg(seg, fracStart)[1];
        // Remap fracEnd within remaining portion
        const remapped = fracStart > 1e-12 ? (fracEnd - fracStart) / (1 - fracStart) : fracEnd;
        if (remapped < 1 - 1e-12) seg = splitSeg(seg, remapped)[0];
        segs.push(seg);
      } else {
        // First (partial) segment
        if (iStart < n) {
          let seg = p.segs[iStart];
          if (fracStart > 1e-12) seg = splitSeg(seg, fracStart)[1];
          segs.push(seg);
        }
        // Full middle segments
        for (let i = iStart + 1; i < Math.min(iEnd, n); i++) {
          segs.push(p.segs[i]);
        }
        // Last (partial) segment
        if (iEnd < n && fracEnd > 1e-12) {
          let seg = p.segs[iEnd];
          seg = splitSeg(seg, fracEnd)[0];
          segs.push(seg);
        }
      }
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
    // Rotate(pair dir) — rotation transform that aligns with direction vector
    env.set('Rotate', (dir) => {
      const p = toPair(dir);
      const angle = Math.atan2(p.y, p.x) * 180 / Math.PI;
      const a = angle * Math.PI / 180;
      const c = Math.cos(a), s = Math.sin(a);
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
    env.set('linewidth', (w) => makePen({linewidth:toNumber(w), _lwExplicit:true, _lwDirect:true}));
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
    // Asymptote standard font functions — map to CSS font stacks
    { const ASY_FONTS = {
        Helvetica: 'Helvetica, Arial, sans-serif',
        HelveticaOblique: 'Helvetica, Arial, sans-serif',
        HelveticaBold: 'Helvetica, Arial, sans-serif',
        HelveticaBoldOblique: 'Helvetica, Arial, sans-serif',
        Times: '"Times New Roman", Times, serif',
        TimesRoman: '"Times New Roman", Times, serif',
        TimesItalic: '"Times New Roman", Times, serif',
        TimesBold: '"Times New Roman", Times, serif',
        TimesRomanBold: '"Times New Roman", Times, serif',
        TimesBoldItalic: '"Times New Roman", Times, serif',
        Courier: '"Courier New", Courier, monospace',
        CourierOblique: '"Courier New", Courier, monospace',
        CourierBold: '"Courier New", Courier, monospace',
        CourierBoldOblique: '"Courier New", Courier, monospace',
        Palatino: 'Palatino, Georgia, serif',
        PalatinoBold: 'Palatino, Georgia, serif',
        ZapfChancery: '"Zapf Chancery", cursive',
        NewCenturySchoolBook: '"New Century Schoolbook", "Century Schoolbook L", serif',
        Bookman: 'Bookman, serif',
        AvantGarde: '"Avant Garde", Futura, sans-serif',
      };
      for (const [name, ff] of Object.entries(ASY_FONTS)) {
        const _ff = ff;
        env.set(name, (...args) => makePen({fontFamily: _ff}));
      }
    }
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
      // size(pic, w, h, keepAspect=bool) or size(w, h, keepAspect=bool) or size(w)
      if (args.length > 0 && args[0] && args[0]._tag === 'picture') {
        // Per-picture sizing: size(p, w[, h]) — store dimensions on the picture so
        // that add(p.fit(), offset) can scale and place it at the correct bp size.
        const pic = args[0];
        const rest = args.slice(1).filter(a => !(a && typeof a === 'object' && a._named));
        if (rest.length >= 1) pic._sizeW = toNumber(rest[0]);
        if (rest.length >= 2) pic._sizeH = toNumber(rest[1]);
        else if (rest.length === 1) pic._sizeH = pic._sizeW;
        return;
      }
      for (const a of args) {
        if (a && typeof a === 'object' && a._named && 'keepAspect' in a) {
          keepAspect = !!a.keepAspect;
        }
      }
      const pos = args.filter(a => !(a && typeof a === 'object' && a._named));
      if (pos.length >= 1) sizeW = toNumber(pos[0]);
      if (pos.length >= 2) sizeH = toNumber(pos[1]);
      else if (pos.length === 1) sizeH = sizeW;  // Asymptote default: size(x) means size(x,x)
      // 3rd positional arg is keepAspect (e.g. size(w, h, IgnoreAspect))
      if (pos.length >= 3 && typeof pos[2] === 'boolean') keepAspect = pos[2];
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

    // graphic(): embed external images (EPS/PNG) pre-fetched by the client
    env.set('graphic', (path, ...rest) => {
      const pathStr = String(path);
      let options = '';
      for (const a of rest) { if (isString(a)) options = a; }
      const cached = _imageCache[pathStr];
      if (!cached || cached.error) throw new Error('graphic: image not available: ' + pathStr);
      return {
        _tag: 'graphic', path: pathStr, options,
        width_bp: cached.width_bp, height_bp: cached.height_bp,
        png_b64: cached.png_b64, transform: null
      };
    });

    // layer(): z-ordering separator. In our renderer labels are always on top,
    // so this is effectively a no-op.
    env.set('layer', () => {});

    // Intersection
    env.set('extension', (P, Q, R, S) => {
      const p=toPair(P),q=toPair(Q),r=toPair(R),s=toPair(S);
      const d1x=q.x-p.x, d1y=q.y-p.y, d2x=s.x-r.x, d2y=s.y-r.y;
      const cross = d1x*d2y - d1y*d2x;
      if (Math.abs(cross) < 1e-12) return makePair(0,0);
      const t = ((r.x-p.x)*d2y - (r.y-p.y)*d2x) / cross;
      return makePair(p.x + t*d1x, p.y + t*d1y);
    });

    // times(path, real) — return sorted array of time values where path.x == val
    // (intersections with the vertical line x = val)
    env.set('times', (p, val) => {
      p = geoToPath(p);
      if (!isPath(p)) return [];
      const x0 = toNumber(val);
      const results = [];
      const tol = 1e-8;
      for (let i = 0; i < p.segs.length; i++) {
        const seg = p.segs[i];
        // Solve cubic Bezier x(t) = x0
        const a = seg.p0.x, b = seg.cp1.x, c = seg.cp2.x, d = seg.p3.x;
        const A = -a + 3*b - 3*c + d;
        const B = 3*a - 6*b + 3*c;
        const C = -3*a + 3*b;
        const D = a - x0;
        const roots = solveCubicReal(A, B, C, D);
        for (const t of roots) {
          if (t >= -tol && t <= 1 + tol) {
            const tc = Math.max(0, Math.min(1, t));
            results.push(i + tc);
          }
        }
      }
      results.sort((a, b) => a - b);
      return results;
    });

    // Solve At^3 + Bt^2 + Ct + D = 0 for real roots
    function solveCubicReal(A, B, C, D) {
      const eps = 1e-12;
      if (Math.abs(A) < eps) {
        // Quadratic or linear
        if (Math.abs(B) < eps) {
          // Linear
          if (Math.abs(C) < eps) return [];
          return [-D / C];
        }
        const disc = C * C - 4 * B * D;
        if (disc < 0) return [];
        const sq = Math.sqrt(disc);
        return [(-C + sq) / (2 * B), (-C - sq) / (2 * B)];
      }
      // Normalize: t^3 + pt^2 + qt + r = 0
      const p = B / A, q = C / A, r = D / A;
      // Depressed cubic substitution t = u - p/3
      const p3 = p / 3;
      const Q = (3 * q - p * p) / 9;
      const R = (9 * p * q - 27 * r - 2 * p * p * p) / 54;
      const disc = Q * Q * Q + R * R;
      if (disc > eps) {
        // One real root
        const sqD = Math.sqrt(disc);
        const S = Math.cbrt(R + sqD);
        const T = Math.cbrt(R - sqD);
        return [S + T - p3];
      } else if (Math.abs(disc) <= eps) {
        // Three real roots, at least two equal
        const S = Math.cbrt(R);
        const r1 = 2 * S - p3;
        const r2 = -S - p3;
        return [r1, r2];
      } else {
        // Three distinct real roots (casus irreducibilis)
        const theta = Math.acos(R / Math.sqrt(-Q * Q * Q));
        const sqQ = 2 * Math.sqrt(-Q);
        return [
          sqQ * Math.cos(theta / 3) - p3,
          sqQ * Math.cos((theta + 2 * Math.PI) / 3) - p3,
          sqQ * Math.cos((theta + 4 * Math.PI) / 3) - p3,
        ];
      }
    }

    env.set('intersect', (p1, p2) => {
      if (!isPath(p1) || !isPath(p2)) return [0, 0];
      // Simplified: return first intersection time pair
      // This is a basic implementation
      return [0, 0];
    });

    // Convert geometry types (geoCircle, geoLine, etc.) to drawable paths
    function geoToPath(a) {
      if (isPath(a)) return a;
      if (isGeoCircle(a)) {
        const C = toPair(a.C);
        return makeCirclePath(C, a.r);
      }
      if (isGeoLine(a)) {
        const A = locatePoint(a.A), B = locatePoint(a.B);
        let p0 = A, p1 = B;
        if (a.extendA || a.extendB) {
          const dx = B.x-A.x, dy = B.y-A.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const far = 200;
          if (a.extendA) p0 = makePair(A.x - far*dx/len, A.y - far*dy/len);
          if (a.extendB) p1 = makePair(B.x + far*dx/len, B.y + far*dy/len);
        }
        return makePath([lineSegment(p0, p1)], false);
      }
      return a;
    }

    env.set('intersectionpoint', (p1, p2) => {
      p1 = geoToPath(p1); p2 = geoToPath(p2);
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
      p1 = geoToPath(p1); p2 = geoToPath(p2);
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

    // Aliases for intersectionpoint(s) — cse5/olympiad shorthand
    env.set('IP', (p1, p2) => invokeFunc(env.get('intersectionpoint'), [p1, p2]));
    env.set('IPs', (p1, p2) => invokeFunc(env.get('intersectionpoints'), [p1, p2]));

    // MP (Marked Point) — cse5/olympiad: draws a dot + label, returns the pair
    env.set('MP', (...args) => {
      // Signature variants: MP(label, pair, dir, pen), MP(label, pair, dir), MP(label, pair)
      let text = null, pos = null, align = null, pen = null;
      for (const a of args) {
        if (isString(a) && text === null) text = a;
        else if (isPair(a) && !pos) pos = a;
        else if (isPair(a) && !align) align = a;
        else if (isPen(a)) pen = a;
      }
      if (!pos) return makePair(0, 0);
      // Draw the dot using pointpen (or given pen)
      const dotPen = pen || env.get('pointpen') || clonePen(defaultPen);
      evalDot([pos, dotPen]);
      // Draw the label if provided. MP wraps text in $...$ (math mode) by convention,
      // so labels should render as math italic like Asymptote/cse5 does.
      if (text) {
        const labelPen = pen || clonePen(defaultPen);
        const mathText = (text.startsWith('$') || text.includes('$')) ? text : '$' + text + '$';
        const labelArgs = [mathText, pos];
        if (align) labelArgs.push(align);
        labelArgs.push(labelPen);
        evalLabel(labelArgs);
      }
      return pos;
    });

    // D() — cse5/olympiad shorthand for draw that returns its path
    env.set('D', (...args) => {
      evalDraw('draw', args);
      // Return the first path argument so D() can be chained
      for (const a of args) { if (isPath(a)) return a; }
      return makePath([], false);
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

    // excenter tangent to AB (opposite vertex C, third arg) — matches Asymptote geometry.asy convention
    // formula: (a*A + b*B - c*C) / (a+b-c)  where a=|BC|, b=|CA|, c=|AB|
    env.set('excenter', (A,B,C) => {
      const a=toPair(A),b_=toPair(B),c_=toPair(C);
      const bc=Math.sqrt((c_.x-b_.x)*(c_.x-b_.x)+(c_.y-b_.y)*(c_.y-b_.y));
      const ca=Math.sqrt((a.x-c_.x)*(a.x-c_.x)+(a.y-c_.y)*(a.y-c_.y));
      const ab=Math.sqrt((b_.x-a.x)*(b_.x-a.x)+(b_.y-a.y)*(b_.y-a.y));
      const denom = bc+ca-ab;
      if(Math.abs(denom)<1e-12) return makePair(0,0);
      return makePair((bc*a.x+ca*b_.x-ab*c_.x)/denom, (bc*a.y+ca*b_.y-ab*c_.y)/denom);
    });

    // exradius tangent to AB (opposite vertex C): sqrt(s*(s-a)*(s-b)/(s-c))
    env.set('exradius', (A,B,C) => {
      const a=toPair(A),b_=toPair(B),c_=toPair(C);
      const bc=Math.sqrt((c_.x-b_.x)*(c_.x-b_.x)+(c_.y-b_.y)*(c_.y-b_.y));
      const ca=Math.sqrt((a.x-c_.x)*(a.x-c_.x)+(a.y-c_.y)*(a.y-c_.y));
      const ab=Math.sqrt((b_.x-a.x)*(b_.x-a.x)+(b_.y-a.y)*(b_.y-a.y));
      const s=(bc+ca+ab)/2;
      return Math.sqrt(Math.max(0,s*(s-bc)*(s-ca)/(s-ab)));
    });

    // excircle opposite vertex A: circle at excenter with exradius
    env.set('excircle', (A,B,C) => {
      const o = invokeFunc(env.get('excenter'), [A,B,C]);
      const r = invokeFunc(env.get('exradius'), [A,B,C]);
      return makeCirclePath(o, r);
    });

    env.set('foot', (P, A, B) => {
      const p=toPair(P),a=toPair(A),b=toPair(B);
      const dx=b.x-a.x, dy=b.y-a.y;
      const t = ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy);
      return makePair(a.x+t*dx, a.y+t*dy);
    });

    // tangent(pair P, pair C, real r, int n=1): nth tangent point from external point P to circle center C radius r
    env.set('tangent', (...args) => {
      let P = null, Cc = null, r = null, n = 1;
      for (const a of args) {
        if (a && typeof a === 'object' && a._named) { if ('n' in a) n = a.n; continue; }
        if (isPair(a) && P === null) { P = toPair(a); continue; }
        if (isPair(a) && Cc === null) { Cc = toPair(a); continue; }
        if (typeof a === 'number' && r === null) { r = a; continue; }
      }
      if (!P || !Cc || r === null) return makePair(0, 0);
      const Dx = P.x - Cc.x, Dy = P.y - Cc.y;
      const d2 = Dx*Dx + Dy*Dy;
      if (d2 <= r*r + 1e-12) return makePair(P.x, P.y);
      const t = Math.sqrt(d2 - r*r);
      const factor = r*r / d2, pf = r * t / d2;
      const bx = Cc.x + factor * Dx, by = Cc.y + factor * Dy;
      // perp(D) = (-Dy, Dx); n=1 uses +perp, n=2 uses -perp
      return n === 2 ? makePair(bx + Dy*pf, by - Dx*pf) : makePair(bx - Dy*pf, by + Dx*pf);
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
      const rawS = rest.length > 0 ? toNumber(rest[0]) : 8;
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

    // anglemark: matching olympiad.asy — arc CCW from ray BA to ray BC, closed back through vertex B
    env.set('anglemark', (...args) => {
      if (args.length < 3) return makePath([], false);
      const A = toPair(args[0]), B = toPair(args[1]), C = toPair(args[2]);
      // olympiad.asy: default t=8, extra radii via rest args (s[])
      const t = args.length > 3 ? toNumber(args[3]) : 8;
      const msf = env.get('markscalefactor') || 0.03;
      const r = t * msf;
      // M = point on ray BA at distance r from B
      const baLen = Math.sqrt((A.x-B.x)*(A.x-B.x) + (A.y-B.y)*(A.y-B.y)) || 1;
      const bcLen = Math.sqrt((C.x-B.x)*(C.x-B.x) + (C.y-B.y)*(C.y-B.y)) || 1;
      const M = makePair(B.x + r*(A.x-B.x)/baLen, B.y + r*(A.y-B.y)/baLen);
      const N = makePair(B.x + r*(C.x-B.x)/bcLen, B.y + r*(C.y-B.y)/bcLen);
      // Arc CCW from M to N around B (matching arc(B,M,N) default CCW)
      let a1 = Math.atan2(M.y - B.y, M.x - B.x) * 180 / Math.PI;
      let a2 = Math.atan2(N.y - B.y, N.x - B.x) * 180 / Math.PI;
      while (a2 < a1) a2 += 360;
      const arcPath = makeArcPath(B, r, a1, a2);
      // Close: arc -- B -- cycle (wedge/sector shape matching olympiad.asy)
      const bPair = makePair(B.x, B.y);
      const lastSeg = arcPath.segs[arcPath.segs.length - 1];
      const arcEnd = lastSeg ? lastSeg.p3 : N;
      const firstSeg = arcPath.segs[0];
      const arcStart = firstSeg ? firstSeg.p0 : M;
      arcPath.segs.push(lineSegment(arcEnd, bPair));
      arcPath.segs.push(lineSegment(bPair, arcStart));
      arcPath.closed = true;
      return arcPath;
    });

    // Labeling helpers
    env.set('Label', (...args) => {
      // Return a label object with text and optional alignment/position info
      let text = '';
      let align = null;
      let position = null;
      let labelPen = null;
      let labelTransform = null;
      for (const a of args) {
        if (isString(a)) text = a;
        else if (isTransform(a)) labelTransform = a;
        else if (isPen(a)) labelPen = labelPen ? mergePens(labelPen, a) : a;
        else if (isPair(a)) { if (!align) align = a; else { position = align; align = a; } }
        else if (a && typeof a === 'object' && a._named) {
          if ('s' in a && isString(a.s)) text = a.s;
          if ('position' in a) position = a.position;
          if ('align' in a) {
            if (isPair(a.align)) align = a.align;
            else if (typeof a.align === 'number') align = makePair(a.align, 0);
          }
          if ('p' in a && isPen(a.p)) labelPen = labelPen ? mergePens(labelPen, a.p) : a.p;
        }
        else if (typeof a === 'number' && position === null) position = a;
      }
      const lbl = {_tag:'label', text, align};
      if (position !== null) lbl.position = position;
      if (labelPen) lbl.pen = labelPen;
      if (labelTransform) lbl.transform = labelTransform;
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
      for (const a of args) {
        if (isString(a)) {
          let s = a;
          // Strip \centering directive at start
          s = s.replace(/^\\centering\s*/, '');
          // Strip \center{...} alignment wrapper
          s = s.replace(/^\\center\{([\s\S]*)\}$/, '$1');
          s = s.trim();
          // Replace LaTeX line breaks \\ with newlines
          s = s.replace(/\\\\/g, '\n');
          // Also handle \ followed by space (older fallback)
          s = s.replace(/\\ /g, '\n');
          return s;
        }
      }
      return '';
    });

    // Array functions
    env.set('copy', (arr) => {
      if (isArray(arr)) return arr.slice();
      return arr;
    });
    env.set('array', (...args) => {
      // array(int n, T value) — returns n-element array filled with value
      const named = {};
      const pos = [];
      for (const a of args) {
        if (a && typeof a === 'object' && a._named) {
          for (const k of Object.keys(a)) if (k !== '_named') named[k] = a[k];
        } else pos.push(a);
      }
      // Try named form first
      if (named.n !== undefined && named.value !== undefined) {
        const n = Math.floor(toNumber(named.n));
        const v = named.value;
        const out = new Array(Math.max(0, n));
        for (let i = 0; i < out.length; i++) out[i] = v;
        return out;
      }
      // array(n, value) positional
      if (pos.length === 2 && typeof pos[0] === 'number') {
        const n = Math.floor(toNumber(pos[0]));
        const v = pos[1];
        const out = new Array(Math.max(0, n));
        for (let i = 0; i < out.length; i++) out[i] = v;
        return out;
      }
      // array(n, value, depth) — depth-nested
      if (pos.length === 3 && typeof pos[0] === 'number' && typeof pos[2] === 'number') {
        const n = Math.floor(toNumber(pos[0]));
        const v = pos[1];
        const d = Math.floor(toNumber(pos[2]));
        function build(level) {
          if (level >= d) return v;
          const out = new Array(n);
          for (let i = 0; i < n; i++) out[i] = build(level + 1);
          return out;
        }
        return build(0);
      }
      // If single string argument, split into array of characters
      if (args.length === 1 && isString(args[0])) return args[0].split('');
      return args;
    });
    // copy(arr) — deep copy arrays (recursive). Scalars passed through.
    env.set('copy', (a) => {
      function deepCopy(v) {
        if (Array.isArray(v)) return v.map(deepCopy);
        return v;
      }
      return deepCopy(a);
    });
    // input(filename) — browser can't read files; return EOF-like file handle so
    // `while(!eof(data))` loops terminate immediately and scripts don't hang.
    env.set('input', (...args) => ({_tag:'file', eof:true, lines:[], pos:0}));
    env.set('output', (...args) => ({_tag:'file', eof:true, lines:[], pos:0}));
    env.set('eof', (f) => (f && f._tag === 'file') ? !!f.eof : true);
    env.set('eol', (f) => true);
    env.set('error', (f) => true);
    env.set('close', (f) => null);
    env.set('stripextension', (s) => { s = String(s||''); const i = s.lastIndexOf('.'); return i >= 0 ? s.slice(0,i) : s; });
    // stripdirectory / stripfile
    env.set('stripdirectory', (s) => { s = String(s||''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i >= 0 ? s.slice(i+1) : s; });
    // file reading ops — return empty / default values so PDB-style parsers bail
    env.set('line', (f) => '');
    env.set('word', (f) => '');
    env.set('dimension', (f,...rest) => null);
    env.set('csv', (f) => f);
    env.set('eolmode', (f) => null);
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

    // unityroot(n, k) — k-th nth root of unity (from math module)
    env.set('unityroot', (n, k) => {
      const N = toNumber(n);
      const K = k !== undefined ? toNumber(k) : 1;
      if (!N) return makePair(1, 0);
      const theta = 2 * Math.PI * K / N;
      return makePair(Math.cos(theta), Math.sin(theta));
    });

    // triangulate(points) — Delaunay triangulation. Returns int[][] where each
    // inner array is {i0,i1,i2} indexing into the input pair[] points.
    env.set('triangulate', (pts) => {
      if (!Array.isArray(pts) || pts.length < 3) return [];
      // Bowyer–Watson algorithm
      const P = pts.map(p => {
        const q = isPair(p) ? p : toPair(p);
        return { x: q.x, y: q.y };
      });
      // Compute a super-triangle that encloses all points
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of P) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
      const dx = maxX - minX || 1, dy = maxY - minY || 1;
      const dmax = Math.max(dx, dy) * 20;
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const s0 = { x: cx - dmax, y: cy - dmax };
      const s1 = { x: cx + dmax, y: cy - dmax };
      const s2 = { x: cx,        y: cy + dmax };
      const n = P.length;
      const pts2 = P.concat([s0, s1, s2]);
      // Circumcircle test
      const inCircumcircle = (a, b, c, p) => {
        const ax = a.x - p.x, ay = a.y - p.y;
        const bx = b.x - p.x, by = b.y - p.y;
        const cx2 = c.x - p.x, cy2 = c.y - p.y;
        const d = ax*(by*(cx2*cx2+cy2*cy2) - cy2*(bx*bx+by*by))
                - ay*(bx*(cx2*cx2+cy2*cy2) - cx2*(bx*bx+by*by))
                + (ax*ax+ay*ay)*(bx*cy2 - by*cx2);
        // CCW orientation adjustment
        const orient = (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x);
        return orient > 0 ? d > 0 : d < 0;
      };
      let tris = [[n, n+1, n+2]];
      for (let i = 0; i < n; ++i) {
        const p = pts2[i];
        const bad = [];
        for (let t = 0; t < tris.length; ++t) {
          const [a,b,c] = tris[t];
          if (inCircumcircle(pts2[a], pts2[b], pts2[c], p)) bad.push(t);
        }
        // Find polygon hole boundary (edges not shared between two bad triangles)
        const edgeKey = (u,v) => (u<v ? u+','+v : v+','+u);
        const edgeCount = new Map();
        const edgeDir = new Map();
        for (const t of bad) {
          const [a,b,c] = tris[t];
          const edges = [[a,b],[b,c],[c,a]];
          for (const [u,v] of edges) {
            const k = edgeKey(u,v);
            edgeCount.set(k, (edgeCount.get(k)||0) + 1);
            edgeDir.set(k, [u,v]);
          }
        }
        const boundary = [];
        for (const [k, cnt] of edgeCount) {
          if (cnt === 1) boundary.push(edgeDir.get(k));
        }
        // Remove bad triangles
        const badSet = new Set(bad);
        tris = tris.filter((_, idx) => !badSet.has(idx));
        // Add new triangles connecting point to boundary
        for (const [u,v] of boundary) tris.push([u, v, i]);
      }
      // Remove triangles that touch the super-triangle
      const out = [];
      for (const t of tris) {
        if (t[0] < n && t[1] < n && t[2] < n) out.push([t[0], t[1], t[2]]);
      }
      return out;
    });

    // drawline(picture pic=currentpicture, pair A, pair B, pen p=currentpen)
    // From Asymptote math module — draws an infinite line through two points.
    // Does not expand the picture bbox; the line is clipped to the final bbox
    // after auto-scaling.
    env.set('drawline', (...args) => {
      let target = currentPic;
      let A = null, B = null, pen = null;
      for (const a of args) {
        if (a && a._tag === 'picture') target = a;
        else if (isPair(a)) {
          const p = toPair(a);
          if (!A) A = p; else if (!B) B = p;
        } else if (isPoint && isPoint(a)) {
          const p = toPair(a);
          if (!A) A = p; else if (!B) B = p;
        } else if (isPen(a)) pen = a;
      }
      if (!A || !B) return;
      if (!pen) pen = clonePen(defaultPen);
      const dx = B.x - A.x, dy = B.y - A.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      // Emit a placeholder path (used only if bbox finalization doesn't run);
      // the actual extended endpoints will be computed from the final bbox.
      const far = 1;
      const p0 = makePair(A.x - far * dx/len, A.y - far * dy/len);
      const p1 = makePair(B.x + far * dx/len, B.y + far * dy/len);
      target.commands.push({
        cmd:'draw',
        path: makePath([lineSegment(p0, p1)], false),
        pen,
        arrow:null,
        line:0,
        _extendedLine: { ax: A.x, ay: A.y, bx: B.x, by: B.y }
      });
    });

    // Misc
    env.set('assert', (cond, msg) => {
      if (!toBool(cond)) throw new Error('Assertion failed: ' + (msg || ''));
    });
    env.set('write', (...args) => {
      if (typeof process !== 'undefined' && process.env && process.env.HTX_WRITE) {
        const parts = args.map(a => {
          if (a === null || a === undefined) return '';
          if (typeof a === 'string') return a;
          if (typeof a === 'number') return String(a);
          if (a && a._tag === 'triple') return `(${a.x},${a.y},${a.z})`;
          if (a && a._tag === 'pair') return `(${a.x},${a.y})`;
          if (Array.isArray(a)) return '[' + a.length + ' items]';
          return JSON.stringify(a).slice(0, 100);
        });
        try { process.stderr.write('[write] ' + parts.join(' ') + '\n'); } catch(e) {}
      }
    });
    env.set('quotient', (a,b) => Math.floor(toNumber(a)/toNumber(b)));
    env.set('unitrand', () => Math.random());

    // Seeded PRNG for rand()/srand() — matches glibc TYPE_3 (degree-31
    // trinomial feedback shift register), which is the default RNG used by
    // glibc's rand()/srand().  This is what real Asymptote (via C stdlib)
    // uses on Linux, so seeded sequences will match the TeXeR server.
    const RAND_MAX = 2147483647; // 2^31 - 1
    const _randTbl = new Int32Array(31);
    let _randFptr = 3;  // front pointer (index into table)
    let _randRptr = 0;  // rear pointer
    function _srand(seed) {
      seed = (toNumber(seed) | 0) >>> 0;
      _randTbl[0] = seed;
      for (let i = 1; i < 31; i++) {
        // glibc init: state[i] = (16807 * state[i-1]) % 2147483647
        // Use BigInt to avoid overflow
        let v = Number(BigInt(16807) * BigInt(_randTbl[i - 1] >>> 0) % BigInt(2147483647));
        _randTbl[i] = v | 0;
      }
      _randFptr = 3;
      _randRptr = 0;
      // glibc runs 310 warm-up calls after seeding
      for (let i = 0; i < 310; i++) _rand();
    }
    function _rand() {
      let val = (_randTbl[_randFptr] + _randTbl[_randRptr]) | 0;
      _randTbl[_randFptr] = val;
      val = (val >>> 1);  // discard low bit
      _randFptr++;
      if (_randFptr >= 31) _randFptr = 0;
      _randRptr++;
      if (_randRptr >= 31) _randRptr = 0;
      return val;
    }
    _srand(1); // default seed
    env.set('srand', (seed) => _srand(seed));
    env.set('rand', () => _rand());
    env.set('randMax', RAND_MAX);

    // Arrow style markers (stored as values for detection)
    const arrowNames = ['Arrow','MidArrow','EndArrow','BeginArrow','Arrows',
      'ArcArrow','EndArcArrow','BeginArcArrow','ArcArrows','Bar','Bars','None'];
    for (const name of arrowNames) {
      env.set(name, (...args) => {
        // Arrow(arrowhead, real size) — first arg may be a null arrowhead type (TeXHead etc.)
        // Find the first numeric argument to use as size
        let sz = 6;
        for (const a of args) {
          if (typeof a === 'number') { sz = a; break; }
        }
        return {_tag:'arrow', style:name, size: sz};
      });
    }

    // Fill types — return tagged objects so label rendering can detect them
    env.set('FillDraw', (...args) => {
      const pen = args.length >= 1 && isPen(args[0]) ? args[0] : makePen({r:1,g:1,b:1});
      return {_tag:'filltype', style:'FillDraw', pen};
    });
    env.set('Fill', (...args) => {
      let pen = makePen({r:1,g:1,b:1});
      for (const a of args) {
        if (isPen(a)) { pen = a; break; }
        if (a && typeof a === 'object' && a._named && 'p' in a && isPen(a.p)) { pen = a.p; break; }
      }
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

    // markangle: draws an angle arc at vertex B from ray BA to ray BC
    // Signature: markangle(Label L="", int n=1, real r=0, real d=0, pen p=currentpen,
    //            arrowbar arrow=None, margin margin=NoMargin, pair A, pair B, pair C)
    env.set('markangle', (...args) => {
      // Parse arguments: last 3 pairs are A, B (vertex), C
      // Earlier args can be: label string, int n, pen, named params (radius/r, n, arrow, marker)
      let label = null;
      let n = 1;
      let radius = null;
      let pen = null;
      let arrow = null;
      let marker = null;
      const pairs = [];

      for (const a of args) {
        if (a && typeof a === 'object' && a._named) {
          if ('radius' in a) radius = toNumber(a.radius);
          if ('r' in a) radius = toNumber(a.r);
          if ('n' in a) n = Math.round(toNumber(a.n));
          if ('arrow' in a) arrow = a.arrow;
          if ('marker' in a) marker = a.marker;
          continue;
        }
        if (isPair(a)) { pairs.push(toPair(a)); continue; }
        if (isPen(a)) { pen = a; continue; }
        if (isString(a)) { label = a; continue; }
        if (a && a._tag === 'label') { label = a.text; if (a.pen) pen = a.pen; continue; }
        if (a && (a._tag === 'arrow' || a === 'Arrow' || typeof a === 'function')) { arrow = a; continue; }
        if (a && a._tag === 'marker') { marker = a; continue; }
        if (typeof a === 'number' && pairs.length === 0) { n = Math.round(a); continue; }
      }

      if (pairs.length < 3) return null;
      const A = pairs[pairs.length - 3];
      const B = pairs[pairs.length - 2]; // vertex
      const C = pairs[pairs.length - 1];

      // radius is in bp (PostScript points).  Convert to user coordinates.
      if (radius === null) {
        radius = 8; // default 8bp
      }
      {
        // Estimate bp→user conversion from size() and current picture bounds.
        // Include the current call's pairs (A, B, C) so the estimate is valid
        // even when markangle is called before any draw() command.
        let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity;
        for (const c of currentPic.commands) {
          if (c.path) for (const s of c.path.segs) {
            for (const p of [s.p0, s.p3]) {
              if (p.x < cMinX) cMinX = p.x; if (p.x > cMaxX) cMaxX = p.x;
              if (p.y < cMinY) cMinY = p.y; if (p.y > cMaxY) cMaxY = p.y;
            }
          }
          if (c.pos) {
            if (c.pos.x < cMinX) cMinX = c.pos.x; if (c.pos.x > cMaxX) cMaxX = c.pos.x;
            if (c.pos.y < cMinY) cMinY = c.pos.y; if (c.pos.y > cMaxY) cMaxY = c.pos.y;
          }
        }
        for (const p of [A, B, C]) {
          if (p.x < cMinX) cMinX = p.x; if (p.x > cMaxX) cMaxX = p.x;
          if (p.y < cMinY) cMinY = p.y; if (p.y > cMaxY) cMaxY = p.y;
        }
        const rangeX = (cMaxX - cMinX) || 1;
        const rangeY = (cMaxY - cMinY) || 1;
        let bpPerUnit = 1;
        if (sizeW > 0 || sizeH > 0) {
          const sw = sizeW > 0 ? sizeW : sizeH;
          const sh = sizeH > 0 ? sizeH : sizeW;
          bpPerUnit = Math.min(sw / rangeX, sh / rangeY);
        } else if (hasUnitScale) {
          bpPerUnit = unitScale;
        } else {
          // Auto-scaled case (no size(), no unitsize()): mirror the
          // renderer's default-size=150 bp logic so radius=Xmm gives a
          // visually-correct arc.
          const defaultSize = 150;
          const maxDim = Math.max(rangeX, rangeY) || 1;
          bpPerUnit = defaultSize / maxDim;
        }
        radius = radius / bpPerUnit;
      }

      // Angles from vertex B to A and C
      let a1 = Math.atan2(A.y - B.y, A.x - B.x) * 180 / Math.PI;
      let a2 = Math.atan2(C.y - B.y, C.x - B.x) * 180 / Math.PI;
      // CCW sweep from BA to BC
      while (a2 <= a1) a2 += 360;

      if (!pen) pen = clonePen(env.get('currentpen') || defaultPen);

      // Draw n concentric arcs
      const gap = radius * 0.15;
      for (let i = 0; i < n; i++) {
        const r = radius + i * gap;

        // Check if we have a marker with stickframe
        if (marker && marker._tag === 'marker' && marker.frame &&
            marker.frame._tag === 'markinterval' && marker.frame.frame &&
            marker.frame.frame._tag === 'stickframe') {

          const stickframe = marker.frame.frame;
          const numTicks = stickframe.n;
          const tickLength = stickframe.length;

          // Convert tick length from mm to user coordinates
          let tickLen = tickLength;
          {
            // Estimate bp→user conversion (same as radius conversion)
            let bpPerUnit = 1;
            if (sizeW > 0 || sizeH > 0) {
              let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity;
              for (const c of currentPic.commands) {
                if (c.path) for (const s of c.path.segs) {
                  for (const p of [s.p0, s.p3]) {
                    if (p.x < cMinX) cMinX = p.x; if (p.x > cMaxX) cMaxX = p.x;
                    if (p.y < cMinY) cMinY = p.y; if (p.y > cMaxY) cMaxY = p.y;
                  }
                }
                if (c.pos) {
                  if (c.pos.x < cMinX) cMinX = c.pos.x; if (c.pos.x > cMaxX) cMaxX = c.pos.x;
                  if (c.pos.y < cMinY) cMinY = c.pos.y; if (c.pos.y > cMaxY) cMaxY = c.pos.y;
                }
              }
              const rangeX = (cMaxX - cMinX) || 1;
              const rangeY = (cMaxY - cMinY) || 1;
              const sw = sizeW > 0 ? sizeW : sizeH;
              const sh = sizeH > 0 ? sizeH : sizeW;
              bpPerUnit = Math.min(sw / rangeX, sh / rangeY);
            } else if (hasUnitScale) {
              bpPerUnit = unitScale;
            }
            // Convert from mm to bp (1mm = 2.834645669bp) then to user units
            tickLen = (tickLength * 2.834645669) / bpPerUnit;
          }

          // Draw ticks at the midpoint of the arc
          const midAngle = (a1 + a2) / 2;
          const midAngleRad = midAngle * Math.PI / 180;

          // Draw tick marks
          const tickGap = tickLen * 0.3; // Small gap between multiple ticks
          const totalTickWidth = numTicks * tickLen + (numTicks - 1) * tickGap;
          const startOffset = -totalTickWidth / 2;

          for (let t = 0; t < numTicks; t++) {
            const tickOffset = startOffset + t * (tickLen + tickGap) + tickLen / 2;

            // Calculate tick endpoints perpendicular to the arc
            const perpAngle = midAngleRad + Math.PI / 2;
            const tickStart = makePair(
              B.x + r * Math.cos(midAngleRad) + tickOffset * Math.cos(perpAngle),
              B.y + r * Math.sin(midAngleRad) + tickOffset * Math.sin(perpAngle)
            );
            const tickEnd = makePair(
              B.x + r * Math.cos(midAngleRad) - tickOffset * Math.cos(perpAngle),
              B.y + r * Math.sin(midAngleRad) - tickOffset * Math.sin(perpAngle)
            );

            // Draw the tick mark
            const tickPath = makePath([tickStart, tickEnd]);
            currentPic.commands.push({cmd:'draw', path:tickPath, pen:clonePen(pen), arrow: null, line:0});
          }
        } else {
          // Normal arc without markers
          const arcPath = makeArcPath(B, r, a1, a2);
          currentPic.commands.push({cmd:'draw', path:arcPath, pen:clonePen(pen), arrow: arrow || null, line:0});
        }
      }

      // Label at the arc midpoint
      if (label) {
        const midAngle = ((a1 + a2) / 2) * Math.PI / 180;
        const labelR = radius + (n - 1) * gap + radius * 0.4;
        const pos = makePair(B.x + labelR * Math.cos(midAngle), B.y + labelR * Math.sin(midAngle));
        currentPic.commands.push({cmd:'label', text: stripLaTeX(label), pos, align:{x:0,y:0}, pen:clonePen(pen), line:0});
      }
      return null;
    });

    // Marker module functions
    env.set('marker', (f) => {
      // Create a marker object
      return { _tag: 'marker', frame: f };
    });

    env.set('markinterval', (frame, rotated = false) => {
      // Create a markinterval object
      return { _tag: 'markinterval', frame: frame, rotated: rotated };
    });

    env.set('stickframe', (...args) => {
      // Parse stickframe parameters
      let n = 1;
      let length = 2; // default 2mm
      for (const a of args) {
        if (a && typeof a === 'object' && a._named) {
          if ('n' in a) n = Math.round(toNumber(a.n));
          continue;
        }
        if (typeof a === 'number') length = a;
      }
      return { _tag: 'stickframe', n: n, length: length };
    });

    env.set('markers', null);
  }

  // ============================================================
  // Graph Package
  // ============================================================

  // ============================================================
  // Contour Package — marching squares for implicit curves
  // ============================================================

  let contourPackageInstalled = false;

  function installContourPackage(env) {
    if (contourPackageInstalled) return;
    contourPackageInstalled = true;

    // contour(f, a, b, levels, n=100)
    // f: function(real,real)->real
    // a: pair (lower-left corner)
    // b: pair (upper-right corner)
    // levels: real[] — contour values to trace
    // n: int — grid resolution (default 100)
    // Returns: guide[] (array of paths)
    env.set('contour', (...args) => {
      let func = null;
      let a = null, b = null;
      let levels = null;
      let n = 100;
      const pairs = [];
      for (const arg of args) {
        if (typeof arg === 'function' || (arg && arg._tag === 'func')) {
          if (!func) func = arg;
          continue;
        }
        if (isPair(arg)) { pairs.push(toPair(arg)); continue; }
        if (isArray(arg)) { levels = arg.map(v => toNumber(v)); continue; }
        if (typeof arg === 'number') { n = Math.round(arg); continue; }
      }
      if (pairs.length >= 2) { a = pairs[0]; b = pairs[1]; }
      if (!func || !a || !b || !levels || levels.length === 0) return [];

      const result = [];
      const nx = n, ny = n;
      const dx = (b.x - a.x) / nx;
      const dy = (b.y - a.y) / ny;

      // Evaluate f on grid
      const grid = [];
      for (let i = 0; i <= nx; i++) {
        grid[i] = [];
        for (let j = 0; j <= ny; j++) {
          const x = a.x + i * dx;
          const y = a.y + j * dy;
          try {
            const v = typeof func === 'function' ? func(x, y) : toNumber(callUserFuncValues(func, [x, y]));
            grid[i][j] = isFinite(v) ? v : 0;
          } catch(e) { grid[i][j] = 0; }
        }
      }

      // Marching squares for each level
      for (const level of levels) {
        // Collect edge intersection segments
        const segments = [];
        for (let i = 0; i < nx; i++) {
          for (let j = 0; j < ny; j++) {
            const v00 = grid[i][j] - level;
            const v10 = grid[i+1][j] - level;
            const v01 = grid[i][j+1] - level;
            const v11 = grid[i+1][j+1] - level;
            const x0 = a.x + i * dx;
            const x1 = a.x + (i+1) * dx;
            const y0 = a.y + j * dy;
            const y1 = a.y + (j+1) * dy;

            // Classify corners: positive=1, negative=0
            const c = ((v00>0?1:0)<<0) | ((v10>0?1:0)<<1) | ((v01>0?1:0)<<2) | ((v11>0?1:0)<<3);
            if (c === 0 || c === 15) continue;

            // Interpolation helper
            const lerp = (va, vb, pa, pb) => {
              const t = Math.abs(va) < 1e-30 && Math.abs(vb) < 1e-30 ? 0.5 : va / (va - vb);
              return {x: pa.x + t * (pb.x - pa.x), y: pa.y + t * (pb.y - pa.y)};
            };
            const p0 = {x:x0,y:y0}, p1 = {x:x1,y:y0}, p2 = {x:x0,y:y1}, p3 = {x:x1,y:y1};
            // Edge midpoints where contour crosses
            const eB = lerp(v00, v10, p0, p1); // bottom
            const eR = lerp(v10, v11, p1, p3); // right
            const eT = lerp(v01, v11, p2, p3); // top
            const eL = lerp(v00, v01, p0, p2); // left

            const addSeg = (a, b) => segments.push([a, b]);
            // Standard marching squares cases
            switch(c) {
              case 1: case 14: addSeg(eB, eL); break;
              case 2: case 13: addSeg(eB, eR); break;
              case 3: case 12: addSeg(eL, eR); break;
              case 4: case 11: addSeg(eL, eT); break;
              case 5: case 10: addSeg(eB, eT); break; // ambiguous, simplified
              case 6: case 9: addSeg(eB, eL); addSeg(eT, eR); break; // saddle, simplified
              case 7: case 8: addSeg(eT, eR); break;
            }
          }
        }

        // Chain segments into paths
        const eps = dx * 0.01 + dy * 0.01;
        const used = new Array(segments.length).fill(false);
        const close = (a, b) => Math.abs(a.x-b.x) < eps && Math.abs(a.y-b.y) < eps;

        for (let si = 0; si < segments.length; si++) {
          if (used[si]) continue;
          used[si] = true;
          const chain = [segments[si][0], segments[si][1]];
          let changed = true;
          while (changed) {
            changed = false;
            for (let sj = 0; sj < segments.length; sj++) {
              if (used[sj]) continue;
              const s = segments[sj];
              if (close(s[0], chain[chain.length-1])) {
                chain.push(s[1]); used[sj] = true; changed = true;
              } else if (close(s[1], chain[chain.length-1])) {
                chain.push(s[0]); used[sj] = true; changed = true;
              } else if (close(s[1], chain[0])) {
                chain.unshift(s[0]); used[sj] = true; changed = true;
              } else if (close(s[0], chain[0])) {
                chain.unshift(s[1]); used[sj] = true; changed = true;
              }
            }
          }
          // Build path from chain
          if (chain.length >= 2) {
            const segs = [];
            for (let k = 0; k < chain.length - 1; k++) {
              segs.push(lineSegment(makePair(chain[k].x, chain[k].y), makePair(chain[k+1].x, chain[k+1].y)));
            }
            const closed = close(chain[0], chain[chain.length-1]);
            result.push(makePath(segs, closed));
          }
        }
      }
      return result;
    });
  }

  // ============================================================
  // Slopefield Package
  // ============================================================

  let slopefieldPackageInstalled = false;

  function installSlopefieldPackage(env) {
    if (slopefieldPackageInstalled) return;
    slopefieldPackageInstalled = true;

    // slopefield(f, a, b, n, pen, arrow)
    // f: function(real,real)->real giving slope dy/dx
    // a: pair (lower-left corner)
    // b: pair (upper-right corner)
    // n: int (number of grid divisions)
    // pen: optional pen for drawing
    // arrow: optional arrow specification
    env.set('slopefield', (...args) => {
      let func = null;
      let a = null, b = null;
      let n = 10;
      let pen = null;
      let arrow = null;
      const pairs = [];

      for (const arg of args) {
        if (typeof arg === 'function' || (arg && arg._tag === 'func')) {
          if (!func) { func = arg; }
          else {
            // Second function — likely an arrow constructor like Arrow; call it to produce arrow object
            try { arrow = invokeFunc(arg, []); } catch(e) {}
          }
          continue;
        }
        if (isPair(arg)) { pairs.push(toPair(arg)); continue; }
        if (isPen(arg)) { pen = arg; continue; }
        if (arg && arg._tag === 'arrow') { arrow = arg; continue; }
        if (typeof arg === 'number') { n = Math.round(arg); continue; }
      }

      if (pairs.length >= 2) { a = pairs[0]; b = pairs[1]; }
      if (!a || !b || !func) return makePath([], false);
      if (!pen) pen = clonePen(defaultPen);

      const pic = {_tag:'picture', commands:[], transform: null};
      const dx = (b.x - a.x) / n;
      const dy = (b.y - a.y) / n;
      // Length of each slope segment (half the cell diagonal, scaled)
      const segLen = Math.min(Math.abs(dx), Math.abs(dy)) * 0.45;

      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
          const x = a.x + i * dx;
          const y = a.y + j * dy;
          let slope;
          try {
            slope = toNumber(invokeFunc(func, [x, y]));
          } catch(e) {
            continue; // skip undefined points
          }
          if (!isFinite(slope)) continue;
          // Direction from slope
          const len = Math.sqrt(1 + slope * slope);
          const ux = segLen / len;
          const uy = segLen * slope / len;
          const p0 = makePair(x - ux, y - uy);
          const p1 = makePair(x + ux, y + uy);
          const seg = makePath([lineSegment(p0, p1)], false);
          pic.commands.push({cmd:'draw', path:seg, pen:clonePen(pen), arrow: arrow || null, line:0});
        }
      }
      return pic;
    });

    // curve(initial, f, a, b) -- trace an ODE solution curve using RK4
    // initial: pair (x0, y0) starting point
    // f: function(real,real)->real giving dy/dx
    // a, b: real x-bounds for the curve
    env.set('curve', (...args) => {
      let func = null, initial = null;
      let xmin = null, xmax = null, ymin = null, ymax = null;
      const pairs = [];
      const nums = [];
      for (const arg of args) {
        if (typeof arg === 'function' || (arg && arg._tag === 'func')) {
          if (!func) func = arg;
          continue;
        }
        if (isPair(arg)) { pairs.push(toPair(arg)); continue; }
        if (typeof arg === 'number') { nums.push(arg); continue; }
      }
      // curve(initial, f, a, b) — a,b are bound pairs
      if (pairs.length >= 3) {
        initial = pairs[0];
        xmin = Math.min(pairs[1].x, pairs[2].x);
        xmax = Math.max(pairs[1].x, pairs[2].x);
        ymin = Math.min(pairs[1].y, pairs[2].y);
        ymax = Math.max(pairs[1].y, pairs[2].y);
      } else if (pairs.length >= 1) {
        initial = pairs[0];
        if (nums.length >= 2) { xmin = nums[0]; xmax = nums[1]; }
      }
      if (!func || !initial) return makePath([], false);
      if (xmin === null) xmin = initial.x - 5;
      if (xmax === null) xmax = initial.x + 5;
      // RK4 integration
      const nSteps = 200;
      // Forward integration from initial.x to xmax
      let x = initial.x, y = initial.y;
      const hFwd = (xmax - x) / nSteps;
      const fwdPts = [makePair(x, y)];
      if (Math.abs(hFwd) > 1e-12) {
        for (let i = 0; i < nSteps; i++) {
          const k1 = toNumber(invokeFunc(func, [x, y]));
          const k2 = toNumber(invokeFunc(func, [x + hFwd/2, y + hFwd/2*k1]));
          const k3 = toNumber(invokeFunc(func, [x + hFwd/2, y + hFwd/2*k2]));
          const k4 = toNumber(invokeFunc(func, [x + hFwd, y + hFwd*k3]));
          y += hFwd * (k1 + 2*k2 + 2*k3 + k4) / 6;
          x += hFwd;
          if (!isFinite(y)) break;
          if (ymin !== null && (y < ymin || y > ymax)) break;
          fwdPts.push(makePair(x, y));
        }
      }
      // Backward integration from initial.x to xmin
      x = initial.x; y = initial.y;
      const hBwd = (xmin - x) / nSteps;
      const bwdPts = [];
      if (Math.abs(hBwd) > 1e-12) {
        for (let i = 0; i < nSteps; i++) {
          const k1 = toNumber(invokeFunc(func, [x, y]));
          const k2 = toNumber(invokeFunc(func, [x + hBwd/2, y + hBwd/2*k1]));
          const k3 = toNumber(invokeFunc(func, [x + hBwd/2, y + hBwd/2*k2]));
          const k4 = toNumber(invokeFunc(func, [x + hBwd, y + hBwd*k3]));
          y += hBwd * (k1 + 2*k2 + 2*k3 + k4) / 6;
          x += hBwd;
          if (!isFinite(y)) break;
          if (ymin !== null && (y < ymin || y > ymax)) break;
          bwdPts.push(makePair(x, y));
        }
      }
      // Combine: reverse backward points + forward points
      bwdPts.reverse();
      const allPts = bwdPts.concat(fwdPts);
      if (allPts.length < 2) return makePath([], false);
      const segs = [];
      for (let i = 0; i < allPts.length - 1; i++) {
        segs.push(lineSegment(allPts[i], allPts[i+1]));
      }
      return makePath(segs, false);
    });
  }

  let graphPackageInstalled = false;

  // Shared axis limit state (accessible from both installGraphPackage and execute)
  let _axisLimits = { xmin: null, xmax: null, ymin: null, ymax: null, crop: false };

  function installGraphPackage(env) {
    if (graphPackageInstalled) return;
    graphPackageInstalled = true;

    // Interpolation constants for graph(): Spline/Hermite → smooth, Linear → straight
    env.set('Spline',  {_tag:'operator', value:'..'});
    env.set('Hermite', {_tag:'operator', value:'..'});
    env.set('Linear',  {_tag:'operator', value:'--'});

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
      // Extract named arguments (e.g. n=700, join=operator ..)
      let namedN = null;
      for (const a of args) {
        if (a && a._named && a.n !== undefined) namedN = Math.floor(a.n);
      }
      // Strip operator/bool3/picture args and named args for cleaner matching
      const coreArgs = args.filter(a => !isOperator(a) && !(a && a._named));

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
      // Supports: graph(f, a, b, n), graph(f_pair, a, b, n), graph(fx, fy, a, b, n), graph(fx, fy, fz, a, b, n)
      let funcArg = null, funcArg2 = null, funcArg3 = null, funcIdx = -1;
      const isFunc = v => typeof v === 'function' || (v && v._tag === 'func');
      for (let i = 0; i < coreArgs.length; i++) {
        if (isFunc(coreArgs[i])) {
          if (funcArg === null) { funcArg = coreArgs[i]; funcIdx = i; }
          else if (funcArg2 === null && i === funcIdx + 1) { funcArg2 = coreArgs[i]; }
          else if (funcArg3 === null && i === funcIdx + 2) { funcArg3 = coreArgs[i]; }
        }
      }

      // Three-function parametric: returns a path with triple points
      if (funcArg3 !== null) {
        const callFunc = (f, t) => typeof f === 'function' ? f(t) : callUserFuncValues(f, [t]);
        const nums = [];
        for (let i = funcIdx + 3; i < coreArgs.length; i++) {
          if (typeof coreArgs[i] === 'number') nums.push(coreArgs[i]);
          else if (isFunc(coreArgs[i])) break;
        }
        const a = nums[0] !== undefined ? nums[0] : 0;
        const b = nums[1] !== undefined ? nums[1] : 1;
        const n = namedN !== null ? namedN : (nums[2] !== undefined ? Math.floor(nums[2]) : 100);
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = a + (b - a) * i / n;
          try {
            const x = toNumber(callFunc(funcArg, t));
            const y = toNumber(callFunc(funcArg2, t));
            const z = toNumber(callFunc(funcArg3, t));
            if (isFinite(x) && isFinite(y) && isFinite(z)) pts.push(makeTriple(x, y, z));
          } catch(e) {}
        }
        if (pts.length < 2) return makePath([], false);
        const segs = [];
        for (let i = 0; i < pts.length - 1; i++) segs.push(lineSegment(pts[i], pts[i+1]));
        return makePath(segs, false);
      }

      // Single function returning a triple: path3 parametric
      if (funcArg !== null && funcArg2 === null) {
        const callFunc = (f, t) => typeof f === 'function' ? f(t) : callUserFuncValues(f, [t]);
        const nums = [];
        for (let i = funcIdx + 1; i < coreArgs.length; i++) {
          if (typeof coreArgs[i] === 'number') nums.push(coreArgs[i]);
          else if (isFunc(coreArgs[i])) break;
        }
        const aT = nums[0] !== undefined ? nums[0] : 0;
        const bT = nums[1] !== undefined ? nums[1] : 1;
        let isTripleFunc = false;
        try {
          const testVal = callFunc(funcArg, aT);
          if (isTriple(testVal)) isTripleFunc = true;
        } catch(e) {}
        if (isTripleFunc) {
          // For smooth curves, use more samples when the parameter range is larger
          const rangeT = Math.abs(bT - aT);
          const defaultN = Math.max(100, Math.ceil(rangeT * 20)); // ~20 samples per unit
          const nT = namedN !== null ? namedN : (nums[2] !== undefined ? Math.floor(nums[2]) : defaultN);
          const pts = [];
          for (let i = 0; i <= nT; i++) {
            const t = aT + (bT - aT) * i / nT;
            try {
              const v = callFunc(funcArg, t);
              if (isTriple(v) && isFinite(v.x) && isFinite(v.y) && isFinite(v.z)) pts.push(v);
            } catch(e) {}
          }
          if (pts.length < 2) return makePath([], false);
          const segs = [];
          for (let i = 0; i < pts.length - 1; i++) segs.push(lineSegment(pts[i], pts[i+1]));
          return makePath(segs, false);
        }
      }

      if (funcArg !== null) {
        // Gather numeric args after the last function arg
        const numsStartIdx = funcArg2 !== null ? funcIdx + 2 : funcIdx + 1;
        const nums = [];
        for (let i = numsStartIdx; i < coreArgs.length; i++) {
          if (typeof coreArgs[i] === 'number') nums.push(coreArgs[i]);
          else if (isFunc(coreArgs[i])) break; // bool3 filter
        }
        const a = nums[0] !== undefined ? nums[0] : 0;
        const b = nums[1] !== undefined ? nums[1] : 1;
        const n = namedN !== null ? namedN : (nums[2] !== undefined ? Math.floor(nums[2]) : 100);

        // Determine mode: two-function parametric, single pair-returning function, or y=f(x)
        const isTwoFuncParametric = funcArg2 !== null;
        let isPairFunc = false;
        if (!isTwoFuncParametric) {
          try {
            const testVal = typeof funcArg === 'function' ? funcArg(a) : callUserFuncValues(funcArg, [a]);
            if (testVal && testVal._tag === 'pair') isPairFunc = true;
          } catch(e) {}
        }

        // Compute y-range limit: if axis limits are set, clip to a reasonable multiple
        const yClipMin = _axisLimits.ymin !== null ? _axisLimits.ymin - (_axisLimits.ymax - _axisLimits.ymin) * 2 : -1e6;
        const yClipMax = _axisLimits.ymax !== null ? _axisLimits.ymax + (_axisLimits.ymax - _axisLimits.ymin) * 2 : 1e6;
        const xClipMin = _axisLimits.xmin !== null ? _axisLimits.xmin - (_axisLimits.xmax - _axisLimits.xmin) * 2 : -1e6;
        const xClipMax = _axisLimits.xmax !== null ? _axisLimits.xmax + (_axisLimits.xmax - _axisLimits.xmin) * 2 : 1e6;

        const callFunc = (f, t) => typeof f === 'function' ? f(t) : callUserFuncValues(f, [t]);

        // Collect all points, then split at discontinuities (out-of-range or large jumps)
        const allPts = [];
        for (let i = 0; i <= n; i++) {
          const t = a + (b - a) * i / n;
          try {
            if (isTwoFuncParametric) {
              const xVal = toNumber(callFunc(funcArg, t));
              const yVal = toNumber(callFunc(funcArg2, t));
              if (isFinite(xVal) && isFinite(yVal)) {
                allPts.push({x: xVal, y: yVal});
              } else {
                allPts.push(null);
              }
            } else {
              const result = callFunc(funcArg, t);
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

    function _drawTicks(ticks, axisDir, min, max, pen, pic, extent, crossMin, crossMax, axisOffset, above) {
      axisOffset = axisOffset || 0;
      if (!ticks) return;
      if (!pic) pic = currentPic;
      const tickPen = ticks.pen || pen;
      const noZero = ticks.noZero || false;
      const isExtend = extent && (extent === 'BottomTop' || extent === 'LeftRight' ||
                                   extent === 'TopBottom' || extent === 'RightLeft');
      // Tick sizes: use the cross-axis range to determine a reasonable tick size.
      // Ticks extend perpendicular to the axis, so the size should be proportional
      // to the perpendicular axis extent, not the along-axis extent.
      // This prevents tick marks from dominating the bbox when x and y scales differ.
      const _isXAxis = (axisDir === 'x');
      let perpAxisRange;
      if (_isXAxis) {
        // X-axis ticks extend in y → use y range
        if (_axisLimits.ymax !== null && _axisLimits.ymin !== null) {
          perpAxisRange = Math.abs(_axisLimits.ymax - _axisLimits.ymin);
        } else {
          // y limits not yet set (yaxis() not called yet); use picture's data y-range
          const _gb = getGeoBbox(pic.commands);
          const gbYR = (_gb && isFinite(_gb.maxY) && isFinite(_gb.minY) && _gb.maxY > _gb.minY)
            ? Math.abs(_gb.maxY - _gb.minY) : 0;
          perpAxisRange = gbYR > 0 ? gbYR : Math.abs(max - min);
        }
      } else {
        // Y-axis ticks extend in x → use x range
        if (_axisLimits.xmax !== null && _axisLimits.xmin !== null) {
          perpAxisRange = Math.abs(_axisLimits.xmax - _axisLimits.xmin);
        } else {
          // x limits not yet set; use picture's data x-range
          const _gb = getGeoBbox(pic.commands);
          const gbXR = (_gb && isFinite(_gb.maxX) && isFinite(_gb.minX) && _gb.maxX > _gb.minX)
            ? Math.abs(_gb.maxX - _gb.minX) : 0;
          perpAxisRange = gbXR > 0 ? gbXR : Math.abs(max - min);
        }
      }
      if (!perpAxisRange || perpAxisRange === 0) perpAxisRange = Math.abs(max - min) || 1;
      const defaultTickSize = perpAxisRange * 0.015;
      let majorSize = ticks.sizeExplicit ? ticks.size : defaultTickSize;
      let minorSize = majorSize * 0.5;
      // If size was explicitly set extremely small (e.g. Size = 0.1pt), the user is
      // suppressing visible tick marks — skip drawing tick lines entirely.
      const skipTickMarks = ticks.sizeExplicit && ticks.size < 0.05;

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
        // Only draw minor ticks when an explicit sub-step was requested (Asymptote default N=0 means no minor ticks)
        const subN = ticks.subStep > 0 ? Math.round(step / ticks.subStep) : 1;
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

      // Tick side: 'left'/'right' for y-axis ticks (LeftTicks/RightTicks)
      // 'left' for y-axis means ticks extend to the left (negative x), 'right' to positive x
      const tickSide = ticks.side || null;

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
        } else if (tickSide === 'left') {
          // Ticks on the left/bottom side only
          p0 = isX ? {x:v, y:axisOffset-sz} : {x:axisOffset-sz, y:v};
          p1 = isX ? {x:v, y:axisOffset} : {x:axisOffset, y:v};
        } else if (tickSide === 'right') {
          // Ticks on the right/top side only
          p0 = isX ? {x:v, y:axisOffset} : {x:axisOffset, y:v};
          p1 = isX ? {x:v, y:axisOffset+sz} : {x:axisOffset+sz, y:v};
        } else {
          p0 = isX ? {x:v, y:axisOffset-sz} : {x:axisOffset-sz, y:v};
          p1 = isX ? {x:v, y:axisOffset+sz} : {x:axisOffset+sz, y:v};
        }
        const tickPath = makePath([lineSegment(p0, p1)], false);
        // Extended gridlines default to background layer (above:-1) so they render below
        // user-drawn paths, but respect above=true to render in foreground when requested.
        pic.commands.push({cmd:'draw', path:tickPath, pen:tickPen, arrow:null, line:0, above: isExtend ? (above ? 1 : -1) : (above ? 1 : 0), _isTickMark: !isExtend});
      }

      // Draw major ticks (skip when size was explicitly set to near-zero)
      if (!skipTickMarks || isExtend) {
        for (const v of majorPositions) drawTick(v, majorSize);
        // Draw minor ticks
        for (const v of minorPositions) drawTick(v, minorSize);
      }

      // Draw labels for major ticks
      // Suppress labels for extend=true ticks (grid lines) or very tiny tick marks
      // (Size=0.1pt style that serves as invisible markers — labels at axis origin
      // inside the chart area hurt SSIM vs reference images that omit them).
      const showLabels = ticks.labels && !isExtend &&
                         !(ticks.sizeExplicit && ticks.size < 1.5);
      if (showLabels) {
        for (const v of majorPositions) {
          if (noZero && Math.abs(v) < 1e-10) continue;
          if (v < min - 1e-10 || v > max + 1e-10) continue;
          const pos = isX ? {x:v, y:axisOffset} : {x:axisOffset, y:v};
          const align = isX ? {x:0, y:-1} : {x:-1, y:0};
          let txt;
          // Default format: Asymptote uses "%.4g" rendered via TeX.
          // toPrecision(4) matches %.4g semantics.
          // For scientific notation (large/small values), render as LaTeX $a\times10^{n}$.
          const fmtDefault = () => {
            if (v === 0) return '0';
            const s4 = v.toPrecision(4);
            const eIdx = s4.indexOf('e');
            if (eIdx !== -1) {
              // Scientific notation: render as LaTeX ×10^n to match Asymptote output
              const mantissa = parseFloat(s4.slice(0, eIdx));
              const exp = parseInt(s4.slice(eIdx + 1));
              const sign = mantissa < 0 ? '-' : '';
              const absMantissa = Math.abs(mantissa);
              if (absMantissa === 1) return '$' + sign + '10^{' + exp + '}$';
              return '$' + sign + absMantissa + '\\times10^{' + exp + '}$';
            }
            // Fixed notation: parseFloat trims trailing zeros correctly
            // (unlike .replace(/\.?0+$/, '') which incorrectly strips "1000" → "1")
            return String(parseFloat(s4));
          };
          if (ticks.labelFunc) {
            // Custom label function: call it with the tick value
            try {
              const fn = ticks.labelFunc;
              if (fn._tag === 'func') txt = callUserFuncValues(fn, [v]);
              else txt = fn(v);
              if (txt === null || txt === undefined) txt = fmtDefault();
              else txt = String(txt);
            } catch(e) { txt = fmtDefault(); }
          } else if (ticks.format && ticks.format !== '%') {
            txt = ticks.format.replace(/%[0-9]*[.]*[0-9]*[dfegs]/g, (spec) => {
              // Simple printf-style: %d→int, %f→fixed, %e→scientific, %g→general
              if (spec.endsWith('d')) return String(Math.round(v));
              if (spec.endsWith('f')) {
                const m = spec.match(/\.(\d+)/);
                return v.toFixed(m ? parseInt(m[1]) : 6);
              }
              if (spec.endsWith('e')) {
                const m = spec.match(/\.(\d+)/);
                return v.toExponential(m ? parseInt(m[1]) : 6);
              }
              if (spec.endsWith('g')) {
                const m = spec.match(/\.(\d+)/);
                const prec = m ? parseInt(m[1]) : 6;
                return v.toPrecision(prec).replace(/\.?0+$/, '');
              }
              // %s — string
              return fmtDefault();
            });
          } else {
            txt = fmtDefault();
          }
          const labelPen = clonePen(ticks.labelPen || tickPen);
          labelPen.fontsize = labelPen.fontsize || 8;
          pic.commands.push({cmd:'label', text:txt, pos, align, pen:labelPen, line:0, _isTickLabel: true});
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

    // XZero = XEquals(0), YZero = YEquals(0)
    env.set('YZero', {_tag:'axisshift', axis:'x', value:0});
    env.set('XZero', {_tag:'axisshift', axis:'y', value:0});

    // xaxis and yaxis
    env.set('xaxis', (...args) => {
      let pic = currentPic;
      let label = '', labelAlign = null, labelPosition = null, xmin = null, xmax = null, pen = null, ticks = null, arrow = null;
      let extent = null; // BottomTop, etc.
      let above = false;
      const rawArgs = args;
      let startIdx = 0;
      if (rawArgs.length > 0 && rawArgs[0] && rawArgs[0]._tag === 'picture') {
        pic = rawArgs[0]; startIdx = 1;
      }
      let axisShiftY = 0;
      for (let i = startIdx; i < rawArgs.length; i++) {
        const a = rawArgs[i];
        if (a === null || a === undefined || a === false) continue;
        if (a === true) { above = true; continue; }
        if (a && typeof a === 'object' && a._named) {
          if ('ticks' in a) ticks = a.ticks;
          if ('p' in a) pen = a.p;
          if ('pen' in a) pen = a.pen;
          if ('above' in a) above = !!a.above;
          if ('axis' in a) {
            const ax = a.axis;
            if (ax && ax._tag === 'axisshift' && ax.axis === 'x') axisShiftY = ax.value;
            else if (ax && ax._tag === 'axisextent') extent = ax.type;
          }
          if ('arrow' in a) {
            let ar = a.arrow;
            if (typeof ar === 'function') { try { ar = ar(); } catch(e) {} }
            if (ar && ar._tag === 'arrow') arrow = ar;
          }
          if ('L' in a) {
            const lv = a.L;
            if (lv && lv._tag === 'label') { label = lv.text; labelAlign = lv.align; if (lv.position != null) labelPosition = lv.position; }
            else if (isString(lv)) label = lv;
          }
          if ('xmin' in a && typeof a.xmin === 'number') xmin = a.xmin;
          if ('xmax' in a && typeof a.xmax === 'number') xmax = a.xmax;
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
      // Update _axisLimits with this axis range so later gridline calls get correct crossMin/crossMax
      if (xmin !== null) {
        if (_axisLimits.xmin === null || xmin < _axisLimits.xmin) _axisLimits.xmin = xmin;
        if (_axisLimits.xmax === null || xmax > _axisLimits.xmax) _axisLimits.xmax = xmax;
      }
      const isInvisible = pen.opacity === 0;
      // Draw axis line (skip if invisible)
      if (!isInvisible) {
        const path = makePath([lineSegment({x:xmin,y:axisShiftY},{x:xmax,y:axisShiftY})], false);
        pic.commands.push({cmd:'draw', path, pen, arrow, line: 0, above: above ? 1 : 0});
      }
      // Cross range for grid lines
      const crossMin = _axisLimits.ymin !== null ? _axisLimits.ymin : -5;
      const crossMax = _axisLimits.ymax !== null ? _axisLimits.ymax : 5;
      _drawTicks(ticks, 'x', xmin, xmax, pen, pic, extent, crossMin, crossMax, axisShiftY, above);
      if (label && !isInvisible) {
        // Default: right-aligned at xmax, pushed below tick labels (W+S combined)
        const lAlign = labelAlign || {x:-1, y:-3};
        let labelX = xmax;
        if (labelPosition != null) labelX = xmin + (xmax - xmin) * labelPosition;
        pic.commands.push({cmd:'label', text: label, pos:{x:labelX, y:axisShiftY}, align:lAlign, pen, line:0});
      }
    });

    env.set('yaxis', (...args) => {
      let pic = currentPic;
      let label = '', labelAlign = null, labelPosition = null, labelTransform = null, ymin = null, ymax = null, pen = null, ticks = null, arrow = null;
      let extent = null;
      let above = false;
      const rawArgs = args;
      let startIdx = 0;
      if (rawArgs.length > 0 && rawArgs[0] && rawArgs[0]._tag === 'picture') {
        pic = rawArgs[0]; startIdx = 1;
      }
      let axisShiftX = 0;
      for (let i = startIdx; i < rawArgs.length; i++) {
        const a = rawArgs[i];
        if (a === null || a === undefined || a === false) continue;
        if (a === true) { above = true; continue; }
        if (a && typeof a === 'object' && a._named) {
          if ('ticks' in a) ticks = a.ticks;
          if ('p' in a) pen = a.p;
          if ('pen' in a) pen = a.pen;
          if ('above' in a) above = !!a.above;
          if ('axis' in a) {
            const ax = a.axis;
            if (ax && ax._tag === 'axisshift' && ax.axis === 'y') axisShiftX = ax.value;
            else if (ax && ax._tag === 'axisextent') extent = ax.type;
          }
          if ('arrow' in a) {
            let ar = a.arrow;
            if (typeof ar === 'function') { try { ar = ar(); } catch(e) {} }
            if (ar && ar._tag === 'arrow') arrow = ar;
          }
          if ('L' in a) {
            const lv = a.L;
            if (lv && lv._tag === 'label') { label = lv.text; labelAlign = lv.align; if (lv.position != null) labelPosition = lv.position; if (lv.transform) labelTransform = lv.transform; }
            else if (isString(lv)) label = lv;
          }
          if ('ymin' in a && typeof a.ymin === 'number') ymin = a.ymin;
          if ('ymax' in a && typeof a.ymax === 'number') ymax = a.ymax;
          continue;
        }
        if (a && a._tag === 'label') { label = a.text; labelAlign = a.align; if (a.position != null) labelPosition = a.position; if (a.transform) labelTransform = a.transform; }
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
      // Update _axisLimits with this axis range so later gridline calls get correct crossMin/crossMax
      if (ymin !== null) {
        if (_axisLimits.ymin === null || ymin < _axisLimits.ymin) _axisLimits.ymin = ymin;
        if (_axisLimits.ymax === null || ymax > _axisLimits.ymax) _axisLimits.ymax = ymax;
      }
      const isInvisible = pen.opacity === 0;
      if (!isInvisible) {
        const path = makePath([lineSegment({x:axisShiftX,y:ymin},{x:axisShiftX,y:ymax})], false);
        pic.commands.push({cmd:'draw', path, pen, arrow, line: 0, above: above ? 1 : 0});
      }
      const crossMin = _axisLimits.xmin !== null ? _axisLimits.xmin : -5;
      const crossMax = _axisLimits.xmax !== null ? _axisLimits.xmax : 5;
      _drawTicks(ticks, 'y', ymin, ymax, pen, pic, extent, crossMin, crossMax, axisShiftX, above);
      if (label && !isInvisible) {
        // In Asymptote's graph.asy, the default position for a y-axis label is at the
        // MIDDLE of the axis (position 0.5), aligned west (left), rotated 90° CCW.
        // Only if the user explicitly sets position=1 (or 0) is the label at the endpoint
        // rendered horizontally.
        const explicitEndpoint = labelPosition === 1 || labelPosition === 0;
        const atEndpoint = explicitEndpoint;
        const effPos = labelPosition == null ? 0.5 : labelPosition;
        const lAlign = labelAlign || (atEndpoint ? {x:0, y:1} : {x:-1, y:0});
        const labelY = ymin + (ymax - ymin) * effPos;
        // Apply 90° CCW rotation when the label is placed along the axis (not endpoint)
        const rot90ccw = {a:0, b:0, c:-1, d:0, e:1, f:0};
        const lt = labelTransform || (atEndpoint ? undefined : rot90ccw);
        // Asymptote's graph.asy autoshifts the axis label past the tick labels so they don't
        // overlap. Only relevant for labels rotated along the axis (not endpoint labels).
        let tickLabelClearance = 0;
        if (!atEndpoint && (labelAlign === null || (lAlign.x < 0 && lAlign.y === 0))) {
          for (const c of pic.commands) {
            if (c._isTickLabel && c.pos && Math.abs(c.pos.x - axisShiftX) < 1e-6) {
              const txt = stripLaTeX(c.text || '');
              const fs = (c.pen && c.pen.fontsize) || 8;
              const w = txt.length * fs * 0.52 + 0.5 * fs;
              if (w > tickLabelClearance) tickLabelClearance = w;
            }
          }
        }
        pic.commands.push({cmd:'label', text: label, pos:{x:axisShiftX, y:labelY}, align:lAlign, pen, labelTransform: lt, line:0, screenDx: tickLabelClearance > 0 ? -tickLabelClearance : 0, _isAxisLabel: true});
      }
    });

    // xequals / yequals — draw vertical/horizontal line at a given coordinate
    env.set('xequals', (...args) => {
      let x = 0, ymin = null, ymax = null, pen = null, ticks = null, arrow = null;
      let above = false;
      let gotX = false;
      for (const a of args) {
        if (a === null || a === undefined) continue;
        if (a === true || a === false) { above = a; continue; }
        if (a && typeof a === 'object' && a._named) {
          if ('ymin' in a) ymin = a.ymin;
          if ('ymax' in a) ymax = a.ymax;
          if ('p' in a && isPen(a.p)) pen = pen ? mergePens(pen, a.p) : a.p;
          if ('pen' in a && isPen(a.pen)) pen = pen ? mergePens(pen, a.pen) : a.pen;
          if ('above' in a) above = !!a.above;
          if ('Ticks' in a && a.Ticks && a.Ticks._tag === 'ticks') ticks = a.Ticks;
          if ('ticks' in a && a.ticks && a.ticks._tag === 'ticks') ticks = a.ticks;
          continue;
        }
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
      currentPic.commands.push({cmd:'draw', path, pen, arrow, line:0, above: above ? 1 : 0});
      if (ticks) {
        const tickPen = ticks.pen || pen;
        const tickSize = ticks.size || 0.1;
        // When Size is explicitly set to a very small value (e.g. Size = 0.1pt),
        // treat as intentionally suppressed tick marks — skip drawing the tick lines.
        const skipTickMarks = ticks.sizeExplicit && ticks.size < 0.05;
        const showTickLabels = ticks.labels && !(ticks.sizeExplicit && ticks.size < 1.5 && !ticks.format);
        const positions = ticks.positions && isArray(ticks.positions) ? ticks.positions.map(v=>toNumber(v)) : [];
        if (positions.length === 0 && ticks.step > 0) {
          for (let v = Math.ceil(ymin/ticks.step)*ticks.step; v <= ymax+1e-10; v += ticks.step) positions.push(Math.round(v*1e10)/1e10);
        }
        for (const v of positions) {
          if (ticks.noZero && Math.abs(v) < 1e-10) continue;
          const tp = makePath([lineSegment({x:x-tickSize,y:v},{x:x+tickSize,y:v})], false);
          currentPic.commands.push({cmd:'draw', path:tp, pen:tickPen, arrow:null, line:0, above: above ? 1 : 0});
          if (showTickLabels) {
            currentPic.commands.push({cmd:'label', text:String(Math.round(v*1000)/1000), pos:{x,y:v}, align:{x:-1,y:0}, pen:tickPen, line:0});
          }
        }
      }
    });

    env.set('yequals', (...args) => {
      let y = 0, xmin = null, xmax = null, pen = null, ticks = null, arrow = null;
      let above = false;
      let gotY = false;
      for (const a of args) {
        if (a === null || a === undefined) continue;
        if (a === true || a === false) { above = a; continue; }
        if (a && typeof a === 'object' && a._named) {
          if ('xmin' in a) xmin = a.xmin;
          if ('xmax' in a) xmax = a.xmax;
          if ('p' in a && isPen(a.p)) pen = pen ? mergePens(pen, a.p) : a.p;
          if ('pen' in a && isPen(a.pen)) pen = pen ? mergePens(pen, a.pen) : a.pen;
          if ('above' in a) above = !!a.above;
          if ('Ticks' in a && a.Ticks && a.Ticks._tag === 'ticks') ticks = a.Ticks;
          if ('ticks' in a && a.ticks && a.ticks._tag === 'ticks') ticks = a.ticks;
          continue;
        }
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
      currentPic.commands.push({cmd:'draw', path, pen, arrow, line:0, above: above ? 1 : 0});
      if (ticks) {
        const tickPen = ticks.pen || pen;
        const tickSize = ticks.size || 0.1;
        // When Size is explicitly set to a very small value (e.g. Size = 0.1pt),
        // treat as intentionally suppressed tick marks — skip drawing the tick lines.
        const skipTickMarks = ticks.sizeExplicit && ticks.size < 0.05;
        const showTickLabels = ticks.labels && !(ticks.sizeExplicit && ticks.size < 1.5 && !ticks.format);
        const positions = ticks.positions && isArray(ticks.positions) ? ticks.positions.map(v=>toNumber(v)) : [];
        if (positions.length === 0 && ticks.step > 0) {
          for (let v = Math.ceil(xmin/ticks.step)*ticks.step; v <= xmax+1e-10; v += ticks.step) positions.push(Math.round(v*1e10)/1e10);
        }
        for (const v of positions) {
          if (ticks.noZero && Math.abs(v) < 1e-10) continue;
          const tp = makePath([lineSegment({x:v,y:y-tickSize},{x:v,y:y+tickSize})], false);
          currentPic.commands.push({cmd:'draw', path:tp, pen:tickPen, arrow:null, line:0, above: above ? 1 : 0});
          if (showTickLabels) {
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
      let text = '', x = 0, pen = null, align = null;
      for (const a of args) {
        if (isString(a) && !text) text = a;
        else if (isPair(a)) align = toPair(a);
        else if (typeof a === 'number') x = a;
        else if (isPen(a)) pen = a;
      }
      if (!pen) pen = clonePen(defaultPen);
      if (!align) align = {x:0, y:-1};
      currentPic.commands.push({cmd:'label', text: stripLaTeX(text), pos:{x,y:0}, align, pen, line:0});
    });
    env.set('labely', (...args) => {
      let text = '', y = 0, pen = null, align = null;
      for (const a of args) {
        if (isString(a) && !text) text = a;
        else if (isPair(a)) align = toPair(a);
        else if (typeof a === 'number') y = a;
        else if (isPen(a)) pen = a;
      }
      if (!pen) pen = clonePen(defaultPen);
      if (!align) align = {x:-1, y:0};
      currentPic.commands.push({cmd:'label', text: stripLaTeX(text), pos:{x:0,y}, align, pen, line:0});
    });

    // Ticks constructors — accept format string, positions array, Step, pen, Size, etc.
    function _makeTicks(args, defaults) {
      const t = Object.assign({_tag:'ticks', step:0, size:0, sizeExplicit:false, labels:true, noZero:false, positions:null, pen:null, extend:false, subStep:0, beginlabel:true, endlabel:true}, defaults);
      let positionalNumCount = 0;
      for (const a of args) {
        if (a === null || a === undefined) continue;
        if (typeof a === 'number') {
          positionalNumCount++;
          if (positionalNumCount === 1) t.step = a;       // first number = Step (major)
          else if (positionalNumCount === 2) t.subStep = a; // second = step (minor)
          else { t.size = a; t.sizeExplicit = true; }      // third+ = Size
        }
        else if (isString(a)) { t.format = a; t.labels = true; }
        else if (typeof a === 'function' || (a && a._tag === 'func')) { t.labelFunc = a; t.labels = true; }
        else if (isPen(a)) t.pen = a;
        else if (isArray(a)) t.positions = a;
        else if (a === true || a === false) t.extend = a;
        else if (a && a._tag === 'label') { t.labels = true; if (a.text) t.format = a.text; if (a.pen) t.labelPen = a.pen; }
        else if (a && a._tag === 'tickmod') { if (a.noZero) t.noZero = true; }
        else if (a && typeof a === 'object' && a._named) {
          if ('Step' in a) t.step = a.Step;
          if ('step' in a) t.subStep = a.step;
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
      let targetPic = null;
      const pairs = [];
      let hasCrop = false;
      for (const a of args) {
        if (a && a._tag === 'picture') targetPic = a;
        else if (isPair(a)) pairs.push(a);
        else if (a === true) hasCrop = true; // Crop is env-set to true
      }
      // If a specific picture is given, store limits on that picture (not globally)
      // so each sub-picture gets its own crop clip region
      if (targetPic) {
        if (!targetPic._picLimits) targetPic._picLimits = {};
        const pl = targetPic._picLimits;
        if (pairs.length >= 2) {
          pl.xmin = pairs[0].x; pl.ymin = pairs[0].y;
          pl.xmax = pairs[1].x; pl.ymax = pairs[1].y;
        }
        if (hasCrop) pl.crop = true;
        return;
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
  // Geometry Package (coordsys, point, vector, line, circle, etc.)
  // ============================================================

  function installGeometryPackage(env) {
    // Default coordinate system: standard Cartesian
    const defaultCS = makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
    env.set('defaultcoordsys', defaultCS);
    env.set('currentcoordsys', defaultCS);

    // cartesiansystem(pair O, pair i, pair j) → coordsys
    env.set('cartesiansystem', (...args) => {
      let O = makePair(0,0), i = makePair(1,0), j = makePair(0,1);
      let posIdx = 0;
      for (const a of args) {
        if (a && typeof a === 'object' && a._named) {
          if ('i' in a) i = toPair(a.i);
          if ('j' in a) j = toPair(a.j);
        } else if (isPair(a) || isNumber(a)) {
          if (posIdx === 0) O = toPair(a);
          else if (posIdx === 1) i = toPair(a);
          else if (posIdx === 2) j = toPair(a);
          posIdx++;
        }
      }
      return makeCoordSys(O, i, j);
    });

    // show(Label lo, Label li, Label lj, coordsys R, pen dotpen, pen xpen, pen ypen, pen ipen, pen jpen, arrowbar arrow)
    // Draws the axes and basis vectors of a coordinate system
    env.set('show', (...args) => {
      let target = currentPic;
      if (args.length > 0 && args[0] && args[0]._tag === 'picture') {
        target = args[0];
        args = args.slice(1);
      }
      // Extract coordsys, labels, pens
      let R = null;
      const labels = []; // up to 3: origin label, i label, j label
      let dotpen = null, xpen = null, ypen = null, ipen = null, jpen = null;
      let arrow = null;

      for (const a of args) {
        if (a === null || a === undefined) continue;
        if (isCoordSys(a)) R = a;
        else if (a && a._tag === 'arrow') arrow = a;
        else if (typeof a === 'function' && !arrow) {
          try { const r = a(); if (r && r._tag === 'arrow') arrow = r; } catch(e) {}
        }
        else if (isString(a) || (a && a._tag === 'label')) labels.push(a);
        else if (isPen(a)) {
          if (a && typeof a === 'object' && a._named) {
            if ('xpen' in a) xpen = a.xpen;
            if ('ypen' in a) ypen = a.ypen;
            if ('ipen' in a) ipen = a.ipen;
            if ('jpen' in a) jpen = a.jpen;
            if ('dotpen' in a) dotpen = a.dotpen;
          } else {
            // Positional pens: xpen, ypen, ipen, jpen
            if (!xpen) xpen = a;
            else if (!ypen) ypen = a;
            else if (!ipen) ipen = a;
            else if (!jpen) jpen = a;
          }
        }
        else if (a && typeof a === 'object' && a._named) {
          if ('xpen' in a) xpen = isPen(a.xpen) ? a.xpen : null;
          if ('ypen' in a) ypen = isPen(a.ypen) ? a.ypen : null;
          if ('ipen' in a) ipen = isPen(a.ipen) ? a.ipen : null;
          if ('jpen' in a) jpen = isPen(a.jpen) ? a.jpen : null;
          if ('dotpen' in a) dotpen = isPen(a.dotpen) ? a.dotpen : null;
        }
      }

      if (!R) R = env.get('currentcoordsys') || defaultCS;
      if (!arrow) arrow = {_tag:'arrow', style:'Arrow', size:6};
      if (!ipen) ipen = makePen({r:1,g:0,b:0}); // red
      if (!jpen) jpen = ipen;
      if (!xpen) xpen = clonePen(defaultPen);
      if (!ypen) ypen = xpen;
      if (!dotpen) dotpen = clonePen(defaultPen);

      const O = R.O;
      const iVec = R.i;
      const jVec = R.j;

      const loText = labels[0] || '$O$';
      const liText = labels[1] || '$\\vec{\\imath}$';
      const ljText = labels[2] || '$\\vec{\\jmath}$';

      // Draw x-axis (infinite line through O in direction i) — if xpen not invisible
      if (xpen.opacity > 0) {
        const far = 100; // extend far in each direction
        const xA = makePair(O.x - far * iVec.x, O.y - far * iVec.y);
        const xB = makePair(O.x + far * iVec.x, O.y + far * iVec.y);
        const xPath = makePath([lineSegment(xA, xB)], false);
        target.commands.push({cmd:'draw', path:xPath, pen:xpen, arrow:null, line:0});
      }
      // Draw y-axis (infinite line through O in direction j) — if ypen not invisible
      if (ypen.opacity > 0) {
        const far = 100;
        const yA = makePair(O.x - far * jVec.x, O.y - far * jVec.y);
        const yB = makePair(O.x + far * jVec.x, O.y + far * jVec.y);
        const yPath = makePath([lineSegment(yA, yB)], false);
        target.commands.push({cmd:'draw', path:yPath, pen:ypen, arrow:null, line:0});
      }

      // Draw i basis vector (arrow from O to O+i)
      const iEnd = makePair(O.x + iVec.x, O.y + iVec.y);
      const iPath = makePath([lineSegment(O, iEnd)], false);
      target.commands.push({cmd:'draw', path:iPath, pen:ipen, arrow:arrow, line:0});
      // Label for i vector
      const iMid = makePair((O.x + iEnd.x)/2, (O.y + iEnd.y)/2);
      const liStr = (typeof liText === 'string') ? liText : (liText.text || '');
      if (liStr) {
        // Place label aligned perpendicular to the vector direction
        const iNorm = Math.sqrt(iVec.x*iVec.x + iVec.y*iVec.y) || 1;
        const perpAlign = makePair(-iVec.y / iNorm, iVec.x / iNorm);
        target.commands.push({cmd:'label', text:liStr, pos:iMid, align:perpAlign, pen:ipen, line:0});
      }

      // Draw j basis vector (arrow from O to O+j)
      const jEnd = makePair(O.x + jVec.x, O.y + jVec.y);
      const jPath = makePath([lineSegment(O, jEnd)], false);
      target.commands.push({cmd:'draw', path:jPath, pen:jpen, arrow:arrow, line:0});
      // Label for j vector
      const jMid = makePair((O.x + jEnd.x)/2, (O.y + jEnd.y)/2);
      const ljStr = (typeof ljText === 'string') ? ljText : (ljText.text || '');
      if (ljStr) {
        const jNorm = Math.sqrt(jVec.x*jVec.x + jVec.y*jVec.y) || 1;
        const perpAlign = makePair(-jVec.y / jNorm, jVec.x / jNorm);
        target.commands.push({cmd:'label', text:ljStr, pos:jMid, align:perpAlign, pen:jpen, line:0});
      }

      // Dot at origin
      target.commands.push({cmd:'dot', pos:O, pen:dotpen, line:0});
      // Origin label
      const loStr = (typeof loText === 'string') ? loText : (loText.text || '');
      if (loStr) {
        target.commands.push({cmd:'label', text:loStr, pos:O, align:makePair(-1,-1), pen:dotpen, line:0});
      }
    });

    // origin — as a variable: point(defaultcoordsys, (0,0))
    env.set('origin', makePoint(defaultCS, makePair(0,0), 1));

    // origin() — as a function: point(currentcoordsys, (0,0))
    // We use a dual mechanism: the env has 'origin' as a point,
    // but we also register _builtinFuncs so origin() works as a function call.
    const originFunc = (...args) => {
      let R = null;
      for (const a of args) {
        if (isCoordSys(a)) R = a;
      }
      if (!R) R = env.get('currentcoordsys') || defaultCS;
      return makePoint(R, makePair(0,0), 1);
    };
    // Store in builtins so it can be called even if overridden by variable
    _builtinFuncs.set('origin', originFunc);

    // locate(point) → pair in default coords
    // locate(vector) → pair displacement in default coords
    // locate(pair) → pair (identity)
    env.set('locate', (...args) => {
      const v = args[0];
      if (isPoint(v)) return locatePoint(v);
      if (isGeoVector(v)) return locateVector(v);
      if (isPair(v)) return v;
      return toPair(v);
    });

    // point(coordsys R, pair p, real m=1) → point
    env.set('point', (...args) => {
      let R = null, p = null, m = 1;
      for (const a of args) {
        if (isCoordSys(a) && !R) R = a;
        else if (isPoint(a) && !p) {
          // point(coordsys R, point M) — re-express M in R
          if (R) {
            const loc = locatePoint(a);
            p = R.defaultToRelative(loc);
            m = a.m;
          } else {
            return a; // just return the point
          }
        }
        else if ((isPair(a) || isNumber(a)) && !p) p = toPair(a);
        else if (typeof a === 'number' && p) m = a;
      }
      if (!R) R = env.get('currentcoordsys') || defaultCS;
      if (!p) p = makePair(0,0);
      return makePoint(R, p, m);
    });

    // vector(coordsys R, pair v) → vector
    env.set('vector', (...args) => {
      let R = null, p = null;
      for (const a of args) {
        if (isCoordSys(a) && !R) R = a;
        else if (isPoint(a)) {
          // vector(point M) → OM vector
          return makeGeoVector(a.coordsys, a.coordinates);
        }
        else if (isGeoVector(a)) return a;
        else if ((isPair(a) || isNumber(a)) && !p) p = toPair(a);
      }
      if (!R) R = env.get('currentcoordsys') || defaultCS;
      if (!p) p = makePair(0,0);
      return makeGeoVector(R, p);
    });

    // changecoordsys(coordsys R, point M) — same physical location, different system
    env.set('changecoordsys', (...args) => {
      let R = null;
      for (const a of args) {
        if (isCoordSys(a) && !R) R = a;
        else if (isPoint(a)) {
          if (!R) R = env.get('currentcoordsys') || defaultCS;
          const loc = locatePoint(a);
          return makePoint(R, R.defaultToRelative(loc), a.m);
        }
        else if (isGeoVector(a)) {
          if (!R) R = env.get('currentcoordsys') || defaultCS;
          const d = locateVector(a);
          // Vector displacement: express in new system without origin offset
          const di = R.defaultToRelative(makePair(R.O.x + d.x, R.O.y + d.y));
          return makeGeoVector(R, di);
        }
      }
      return null;
    });

    // coordsys(point M) → M.coordsys
    // coordsys(line l) → l.A.coordsys
    const coordsysFunc = (...args) => {
      const v = args[0];
      if (isPoint(v)) return v.coordsys;
      if (isGeoVector(v)) return v.v.coordsys;
      if (isGeoLine(v)) return v.A.coordsys;
      if (isCoordSys(v)) return v;
      return env.get('currentcoordsys') || defaultCS;
    };
    env.set('coordsys', coordsysFunc);
    _builtinFuncs.set('coordsys', coordsysFunc);

    // drawline(picture pic, pair A, pair B, pen p)
    // Draws an infinite line through two points
    env.set('drawline', (...args) => {
      let target = currentPic;
      if (args.length > 0 && args[0] && args[0]._tag === 'picture') {
        target = args[0]; args = args.slice(1);
      }
      let A = null, B = null, pen = null;
      for (const a of args) {
        if (isPair(a) || isPoint(a)) {
          const p = toPair(a);
          if (!A) A = p; else if (!B) B = p;
        } else if (isPen(a)) pen = a;
      }
      if (!A || !B) return;
      if (!pen) pen = clonePen(defaultPen);
      // Extend the line far in both directions
      const dx = B.x - A.x, dy = B.y - A.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const far = 200;
      const p0 = makePair(A.x - far * dx/len, A.y - far * dy/len);
      const p1 = makePair(B.x + far * dx/len, B.y + far * dy/len);
      target.commands.push({cmd:'draw', path: makePath([lineSegment(p0, p1)], false), pen, arrow:null, line:0});
    });

    // ────────────────────────────────────────────────────────────
    // Line / Segment
    // ────────────────────────────────────────────────────────────

    // line(point A, bool extendA=true, point B, bool extendB=true)
    env.set('line', (...args) => {
      let pts = [], extA = true, extB = true;
      for (const a of args) {
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
        else if (typeof a === 'boolean') {
          if (pts.length <= 1) extA = a; else extB = a;
        }
        else if (a && typeof a === 'object' && a._named) {
          if ('extendA' in a) extA = !!a.extendA;
          if ('extendB' in a) extB = !!a.extendB;
        }
      }
      if (pts.length < 2) return null;
      return makeGeoLine(pts[0], pts[1], extA, extB);
    });

    // segment(point A, point B)
    env.set('segment', (...args) => {
      let pts = [];
      for (const a of args) {
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
      }
      if (pts.length < 2) return null;
      return makeSegment(pts[0], pts[1]);
    });

    // Line(pair A, pair B, real extendA, real extendB)
    env.set('Line', (...args) => {
      // Expecting Line(point/pair A, point/pair B, real extendA, real extendB)
      let pts = [];
      let extA = 0, extB = 0;
      let numIdx = 0;

      for (const a of args) {
        if (isPoint(a)) {
          pts.push(a);
        } else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        } else if (typeof a === 'number') {
          if (numIdx === 0) extA = a;
          else if (numIdx === 1) extB = a;
          numIdx++;
        }
      }

      if (pts.length < 2) return null;

      // Convert points to pairs
      const A = locatePoint(pts[0]);
      const B = locatePoint(pts[1]);

      // Calculate direction vector
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.sqrt(dx*dx + dy*dy);

      if (len === 0) return makeGeoLine(pts[0], pts[1], false, false);

      // Normalize direction
      const ux = dx / len;
      const uy = dy / len;

      // Extend points by the specified amounts
      const newA = makePair(A.x - extA * ux, A.y - extA * uy);
      const newB = makePair(B.x + extB * ux, B.y + extB * uy);

      // Create extended points in the coordinate system
      const cs = pts[0].coordsys;
      const extPtA = makePoint(cs, cs.defaultToRelative(newA), 1);
      const extPtB = makePoint(cs, cs.defaultToRelative(newB), 1);

      // Return a segment (not extended further) between the extended points
      return makeGeoLine(extPtA, extPtB, false, false);
    });

    // Ox(coordsys R) → x-axis line
    env.set('Ox', (...args) => {
      let R = null;
      for (const a of args) { if (isCoordSys(a)) R = a; }
      if (!R) R = env.get('currentcoordsys') || defaultCS;
      const O = makePoint(R, makePair(0,0), 1);
      const I = makePoint(R, makePair(1,0), 1);
      return makeGeoLine(O, I, true, true);
    });

    // Oy(coordsys R) → y-axis line
    env.set('Oy', (...args) => {
      let R = null;
      for (const a of args) { if (isCoordSys(a)) R = a; }
      if (!R) R = env.get('currentcoordsys') || defaultCS;
      const O = makePoint(R, makePair(0,0), 1);
      const J = makePoint(R, makePair(0,1), 1);
      return makeGeoLine(O, J, true, true);
    });

    // ────────────────────────────────────────────────────────────
    // Circle
    // ────────────────────────────────────────────────────────────

    // circle(point C, real r) or circle(point A, point B) [diameter]
    env.set('circle', (...args) => {
      let pts = [], r = null;
      for (const a of args) {
        if (isPoint(a) || isPair(a)) pts.push(a);
        else if (typeof a === 'number' && r === null) r = a;
      }
      if (pts.length >= 1 && r !== null) {
        return makeGeoCircle(pts[0], r);
      }
      if (pts.length >= 2) {
        // Diameter: center = midpoint, radius = half distance
        const A = toPair(pts[0]), B = toPair(pts[1]);
        const C = makePair((A.x+B.x)/2, (A.y+B.y)/2);
        const cs = env.get('currentcoordsys') || defaultCS;
        const rad = Math.sqrt((B.x-A.x)*(B.x-A.x) + (B.y-A.y)*(B.y-A.y)) / 2;
        return makeGeoCircle(makePoint(cs, cs.defaultToRelative(C), 1), rad);
      }
      return null;
    });

    // circumcircle(point A, point B, point C)
    env.set('circumcircle', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isPoint(a)) pts.push(locatePoint(a));
        else if (isPair(a)) pts.push(a);
      }
      if (pts.length < 3) return null;
      const ax = pts[0].x, ay = pts[0].y;
      const bx = pts[1].x, by = pts[1].y;
      const cx = pts[2].x, cy = pts[2].y;
      const D = 2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
      if (Math.abs(D) < 1e-12) return null;
      const ux = ((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/D;
      const uy = ((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/D;
      const r = Math.sqrt((ax-ux)*(ax-ux)+(ay-uy)*(ay-uy));
      const cs = env.get('currentcoordsys') || defaultCS;
      return makeGeoCircle(makePoint(cs, cs.defaultToRelative(makePair(ux,uy)),1), r);
    });

    // incircle(point A, point B, point C)
    env.set('incircle', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isPoint(a)) pts.push(locatePoint(a));
        else if (isPair(a)) pts.push(a);
      }
      if (pts.length < 3) return null;
      const A = pts[0], B = pts[1], C = pts[2];
      const a = Math.sqrt((B.x-C.x)*(B.x-C.x)+(B.y-C.y)*(B.y-C.y));
      const b = Math.sqrt((A.x-C.x)*(A.x-C.x)+(A.y-C.y)*(A.y-C.y));
      const c = Math.sqrt((A.x-B.x)*(A.x-B.x)+(A.y-B.y)*(A.y-B.y));
      const P = a+b+c;
      if (P < 1e-12) return null;
      const ix = (a*A.x+b*B.x+c*C.x)/P;
      const iy = (a*A.y+b*B.y+c*C.y)/P;
      // Inradius = area / semi-perimeter
      const area = Math.abs((B.x-A.x)*(C.y-A.y)-(C.x-A.x)*(B.y-A.y))/2;
      const r = area / (P/2);
      const cs = env.get('currentcoordsys') || defaultCS;
      return makeGeoCircle(makePoint(cs, cs.defaultToRelative(makePair(ix,iy)),1), r);
    });

    // ────────────────────────────────────────────────────────────
    // Triangle
    // ────────────────────────────────────────────────────────────

    // triangle(point A, point B, point C)
    env.set('triangle', (...args) => {
      const pts = [];
      // Named args: a, b, c (sides), alpha, beta, gamma (angles in degrees)
      let a = null, b = null, c = null, alpha = null, beta = null, gamma = null;
      for (const x of args) {
        if (isPoint(x)) pts.push(x);
        else if (isPair(x)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, x, 1));
        }
        else if (x && x._named) {
          if ('a' in x) a = toNumber(x.a);
          if ('b' in x) b = toNumber(x.b);
          if ('c' in x) c = toNumber(x.c);
          if ('alpha' in x) alpha = toNumber(x.alpha);
          if ('beta' in x) beta = toNumber(x.beta);
          if ('gamma' in x) gamma = toNumber(x.gamma);
        }
      }
      if (pts.length >= 3) {
        return makeTriangleGeo(pts[0], pts[1], pts[2]);
      }
      // Build triangle from sides/angles.  Place A at origin, B on +x axis.
      if (a != null && b != null && c != null) {
        // SSS — sides a,b,c.  a opposite A, etc.  Place B-C = a along x axis?
        // Convention: put A at origin, B at (c,0).  Then C found from |AC|=b,|BC|=a.
        const A = makePair(0,0);
        const B = makePair(c, 0);
        const cosA = (b*b + c*c - a*a) / (2*b*c);
        const sinA = Math.sqrt(Math.max(0, 1 - cosA*cosA));
        const C = makePair(b*cosA, b*sinA);
        const cs = env.get('currentcoordsys') || defaultCS;
        return makeTriangleGeo(makePoint(cs,A,1), makePoint(cs,B,1), makePoint(cs,C,1));
      }
      if (b != null && c != null && alpha != null) {
        // SAS — sides b,c with angle alpha at A
        const A = makePair(0,0);
        const B = makePair(c, 0);
        const rad = alpha * Math.PI / 180;
        const C = makePair(b * Math.cos(rad), b * Math.sin(rad));
        const cs = env.get('currentcoordsys') || defaultCS;
        return makeTriangleGeo(makePoint(cs,A,1), makePoint(cs,B,1), makePoint(cs,C,1));
      }
      if (a != null && c != null && beta != null) {
        // SAS — sides a,c with angle beta at B
        const A = makePair(0,0);
        const B = makePair(c, 0);
        const rad = (180 - beta) * Math.PI / 180;
        const C = makePair(B.x + a * Math.cos(rad), B.y + a * Math.sin(rad));
        const cs = env.get('currentcoordsys') || defaultCS;
        return makeTriangleGeo(makePoint(cs,A,1), makePoint(cs,B,1), makePoint(cs,C,1));
      }
      if (a != null && b != null && gamma != null) {
        // SAS — sides a,b with angle gamma at C.  Use law of cosines for c.
        const c2 = a*a + b*b - 2*a*b*Math.cos(gamma * Math.PI / 180);
        const cLen = Math.sqrt(Math.max(0, c2));
        const A = makePair(0,0);
        const B = makePair(cLen, 0);
        const cosA = (b*b + cLen*cLen - a*a) / (2*b*cLen);
        const sinA = Math.sqrt(Math.max(0, 1 - cosA*cosA));
        const C = makePair(b*cosA, b*sinA);
        const cs = env.get('currentcoordsys') || defaultCS;
        return makeTriangleGeo(makePoint(cs,A,1), makePoint(cs,B,1), makePoint(cs,C,1));
      }
      // ASA variants
      if (alpha != null && c != null && beta != null) {
        const A = makePair(0,0);
        const B = makePair(c, 0);
        // Solve intersection of rays from A (angle alpha) and from B (angle 180-beta)
        const ra = alpha * Math.PI / 180;
        const rb = (180 - beta) * Math.PI / 180;
        // line from A: (t*cos(ra), t*sin(ra))
        // line from B: (c + s*cos(rb), s*sin(rb))
        // Solve: t*sin(ra) = s*sin(rb) and t*cos(ra) = c + s*cos(rb)
        const det = Math.cos(ra)*(-Math.sin(rb)) - (-Math.cos(rb))*Math.sin(ra);
        if (Math.abs(det) < 1e-12) return null;
        const t = (-Math.sin(rb) * (-c) - (-Math.cos(rb)) * 0) / det;
        const C = makePair(t * Math.cos(ra), t * Math.sin(ra));
        const cs = env.get('currentcoordsys') || defaultCS;
        return makeTriangleGeo(makePoint(cs,A,1), makePoint(cs,B,1), makePoint(cs,C,1));
      }
      return null;
    });

    // ────────────────────────────────────────────────────────────
    // Geometric constructions
    // ────────────────────────────────────────────────────────────

    // midpoint(point A, point B) or midpoint(segment)
    env.set('midpoint', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
        else if (isGeoLine(a)) {
          // midpoint of segment
          pts.push(a.A, a.B);
        }
      }
      if (pts.length < 2) return null;
      const A = locatePoint(pts[0]), B = locatePoint(pts[1]);
      const M = makePair((A.x+B.x)/2, (A.y+B.y)/2);
      const cs = pts[0].coordsys;
      return makePoint(cs, cs.defaultToRelative(M), 1);
    });

    // perpendicular(point M, line l) → line perpendicular to l through M
    env.set('perpendicular', (...args) => {
      let M = null, l = null, normal = null;
      for (const a of args) {
        if (isPoint(a) && !M) M = a;
        else if (isPair(a) && !M) {
          const cs = env.get('currentcoordsys') || defaultCS;
          M = makePoint(cs, a, 1);
        }
        else if (isGeoLine(a)) l = a;
        else if (isGeoVector(a) && !normal) normal = a;
      }
      if (!M) return null;
      if (l) {
        const A = locatePoint(l.A), B = locatePoint(l.B);
        const dx = B.x - A.x, dy = B.y - A.y;
        // Perpendicular direction
        const Ml = locatePoint(M);
        const B2 = makePair(Ml.x - dy, Ml.y + dx);
        const cs = M.coordsys;
        return makeGeoLine(M, makePoint(cs, cs.defaultToRelative(B2), 1), true, true);
      }
      if (normal) {
        const d = locateVector(normal);
        const Ml = locatePoint(M);
        const B2 = makePair(Ml.x + d.x, Ml.y + d.y);
        const cs = M.coordsys;
        return makeGeoLine(M, makePoint(cs, cs.defaultToRelative(B2), 1), true, true);
      }
      return null;
    });

    // parallel(point M, line l) → line parallel to l through M
    env.set('parallel', (...args) => {
      let M = null, l = null, dir = null;
      for (const a of args) {
        if (isPoint(a) && !M) M = a;
        else if (isPair(a) && !M) {
          const cs = env.get('currentcoordsys') || defaultCS;
          M = makePoint(cs, a, 1);
        }
        else if (isGeoLine(a)) l = a;
        else if (isGeoVector(a) && !dir) dir = a;
      }
      if (!M) return null;
      if (l) {
        const A = locatePoint(l.A), B = locatePoint(l.B);
        const dx = B.x - A.x, dy = B.y - A.y;
        const Ml = locatePoint(M);
        const B2 = makePair(Ml.x + dx, Ml.y + dy);
        const cs = M.coordsys;
        return makeGeoLine(M, makePoint(cs, cs.defaultToRelative(B2), 1), true, true);
      }
      if (dir) {
        const d = locateVector(dir);
        const Ml = locatePoint(M);
        const B2 = makePair(Ml.x + d.x, Ml.y + d.y);
        const cs = M.coordsys;
        return makeGeoLine(M, makePoint(cs, cs.defaultToRelative(B2), 1), true, true);
      }
      return null;
    });

    // foot(point P, point A, point B) — foot of perpendicular from P to line AB
    env.set('foot', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
        else if (isGeoLine(a)) { pts.push(a.A, a.B); }
      }
      if (pts.length < 3) return null;
      const P = locatePoint(pts[0]), A = locatePoint(pts[1]), B = locatePoint(pts[2]);
      const dx = B.x - A.x, dy = B.y - A.y;
      const t = ((P.x-A.x)*dx + (P.y-A.y)*dy) / (dx*dx + dy*dy);
      const F = makePair(A.x + t*dx, A.y + t*dy);
      const cs = pts[0].coordsys;
      return makePoint(cs, cs.defaultToRelative(F), 1);
    });

    // intersectionpoint(line l1, line l2) → point
    // Also handles geoline types
    const geoIntersectionPoint = (...args) => {
      const lines = [];
      for (const a of args) {
        if (isGeoLine(a)) lines.push(a);
      }
      if (lines.length >= 2) {
        const A = locatePoint(lines[0].A), B = locatePoint(lines[0].B);
        const C = locatePoint(lines[1].A), D = locatePoint(lines[1].B);
        const denom = (A.x-B.x)*(C.y-D.y)-(A.y-B.y)*(C.x-D.x);
        if (Math.abs(denom) < 1e-12) return null;
        const t = ((A.x-C.x)*(C.y-D.y)-(A.y-C.y)*(C.x-D.x)) / denom;
        const P = makePair(A.x + t*(B.x-A.x), A.y + t*(B.y-A.y));
        const cs = lines[0].A.coordsys;
        return makePoint(cs, cs.defaultToRelative(P), 1);
      }
      return null;
    };
    // Register but don't override existing intersectionpoint
    const existingIP = env.get('intersectionpoint');
    env.set('intersectionpoint', (...args) => {
      // If any arg is a geoline, use geometry version
      if (args.some(a => isGeoLine(a))) return geoIntersectionPoint(...args);
      // Otherwise fall back to existing
      if (typeof existingIP === 'function') return existingIP(...args);
      return null;
    });

    // intersectionpoints for geometry types (circle-line, circle-circle)
    const existingIPs = env.get('intersectionpoints');
    env.set('intersectionpoints', (...args) => {
      // circle-line intersection
      const circles = args.filter(a => isGeoCircle(a));
      const glines = args.filter(a => isGeoLine(a));
      if (circles.length >= 1 && glines.length >= 1) {
        const c = circles[0], l = glines[0];
        const C = toPair(c.C), r = c.r;
        const A = locatePoint(l.A), B = locatePoint(l.B);
        const dx = B.x-A.x, dy = B.y-A.y;
        const fx = A.x-C.x, fy = A.y-C.y;
        const a = dx*dx+dy*dy, b = 2*(fx*dx+fy*dy), cc = fx*fx+fy*fy-r*r;
        const disc = b*b - 4*a*cc;
        if (disc < 0) return [];
        const results = [];
        const cs = env.get('currentcoordsys') || defaultCS;
        const t1 = (-b - Math.sqrt(disc)) / (2*a);
        results.push(makePoint(cs, cs.defaultToRelative(makePair(A.x+t1*dx, A.y+t1*dy)), 1));
        if (disc > 1e-12) {
          const t2 = (-b + Math.sqrt(disc)) / (2*a);
          results.push(makePoint(cs, cs.defaultToRelative(makePair(A.x+t2*dx, A.y+t2*dy)), 1));
        }
        return results;
      }
      // circle-circle intersection
      if (circles.length >= 2) {
        const c1 = circles[0], c2 = circles[1];
        const C1 = toPair(c1.C), r1 = c1.r;
        const C2 = toPair(c2.C), r2 = c2.r;
        const dx = C2.x-C1.x, dy = C2.y-C1.y;
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d > r1+r2 || d < Math.abs(r1-r2) || d < 1e-12) return [];
        const a = (r1*r1-r2*r2+d*d)/(2*d);
        const h = Math.sqrt(Math.max(0, r1*r1-a*a));
        const mx = C1.x+a*dx/d, my = C1.y+a*dy/d;
        const cs = env.get('currentcoordsys') || defaultCS;
        const results = [];
        results.push(makePoint(cs, cs.defaultToRelative(makePair(mx+h*dy/d, my-h*dx/d)), 1));
        if (h > 1e-12) {
          results.push(makePoint(cs, cs.defaultToRelative(makePair(mx-h*dy/d, my+h*dx/d)), 1));
        }
        return results;
      }
      // Fallback to existing
      if (typeof existingIPs === 'function') return existingIPs(...args);
      return [];
    });

    // ────────────────────────────────────────────────────────────
    // Triangle centers and special lines
    // ────────────────────────────────────────────────────────────

    env.set('circumcenter', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isTriangleGeo(a)) { pts.push(a.A, a.B, a.C); break; }
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
      }
      if (pts.length < 3) return null;
      const A = locatePoint(pts[0]), B = locatePoint(pts[1]), C = locatePoint(pts[2]);
      const D = 2*(A.x*(B.y-C.y)+B.x*(C.y-A.y)+C.x*(A.y-B.y));
      if (Math.abs(D) < 1e-12) return null;
      const ux = ((A.x*A.x+A.y*A.y)*(B.y-C.y)+(B.x*B.x+B.y*B.y)*(C.y-A.y)+(C.x*C.x+C.y*C.y)*(A.y-B.y))/D;
      const uy = ((A.x*A.x+A.y*A.y)*(C.x-B.x)+(B.x*B.x+B.y*B.y)*(A.x-C.x)+(C.x*C.x+C.y*C.y)*(B.x-A.x))/D;
      const cs = pts[0].coordsys;
      return makePoint(cs, cs.defaultToRelative(makePair(ux,uy)), 1);
    });

    env.set('centroid', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isTriangleGeo(a)) { pts.push(a.A, a.B, a.C); break; }
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
      }
      if (pts.length < 3) return null;
      const A = locatePoint(pts[0]), B = locatePoint(pts[1]), C = locatePoint(pts[2]);
      const G = makePair((A.x+B.x+C.x)/3, (A.y+B.y+C.y)/3);
      const cs = pts[0].coordsys;
      return makePoint(cs, cs.defaultToRelative(G), 1);
    });

    env.set('incenter', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isTriangleGeo(a)) { pts.push(a.A, a.B, a.C); break; }
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
      }
      if (pts.length < 3) return null;
      const A = locatePoint(pts[0]), B = locatePoint(pts[1]), C = locatePoint(pts[2]);
      const a = Math.sqrt((B.x-C.x)*(B.x-C.x)+(B.y-C.y)*(B.y-C.y));
      const b = Math.sqrt((A.x-C.x)*(A.x-C.x)+(A.y-C.y)*(A.y-C.y));
      const c = Math.sqrt((A.x-B.x)*(A.x-B.x)+(A.y-B.y)*(A.y-B.y));
      const P = a+b+c;
      if (P < 1e-12) return null;
      const I = makePair((a*A.x+b*B.x+c*C.x)/P, (a*A.y+b*B.y+c*C.y)/P);
      const cs = pts[0].coordsys;
      return makePoint(cs, cs.defaultToRelative(I), 1);
    });

    // geometry-module excenter tangent to AB (opposite vertex C, third arg) — returns a point object
    // Matches Asymptote geometry.asy: excenter(A,B,C) is tangent to side AB, opposite C
    env.set('excenter', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isTriangleGeo(a)) { pts.push(a.A, a.B, a.C); break; }
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
      }
      if (pts.length < 3) return null;
      const A = locatePoint(pts[0]), B = locatePoint(pts[1]), C = locatePoint(pts[2]);
      const bc = Math.sqrt((B.x-C.x)*(B.x-C.x)+(B.y-C.y)*(B.y-C.y));
      const ca = Math.sqrt((C.x-A.x)*(C.x-A.x)+(C.y-A.y)*(C.y-A.y));
      const ab = Math.sqrt((A.x-B.x)*(A.x-B.x)+(A.y-B.y)*(A.y-B.y));
      const denom = bc + ca - ab;
      if (Math.abs(denom) < 1e-12) return null;
      const Ex = makePair((bc*A.x+ca*B.x-ab*C.x)/denom, (bc*A.y+ca*B.y-ab*C.y)/denom);
      const cs = pts[0].coordsys;
      return makePoint(cs, cs.defaultToRelative(Ex), 1);
    });

    // geometry-module excircle tangent to AB (opposite vertex C) — returns a geocircle
    env.set('excircle', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isTriangleGeo(a)) { pts.push(a.A, a.B, a.C); break; }
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
      }
      if (pts.length < 3) return null;
      const A = locatePoint(pts[0]), B = locatePoint(pts[1]), C = locatePoint(pts[2]);
      const bc = Math.sqrt((B.x-C.x)*(B.x-C.x)+(B.y-C.y)*(B.y-C.y));
      const ca = Math.sqrt((C.x-A.x)*(C.x-A.x)+(C.y-A.y)*(C.y-A.y));
      const ab = Math.sqrt((A.x-B.x)*(A.x-B.x)+(A.y-B.y)*(A.y-B.y));
      const denom = bc + ca - ab;
      if (Math.abs(denom) < 1e-12) return null;
      const Ex = makePair((bc*A.x+ca*B.x-ab*C.x)/denom, (bc*A.y+ca*B.y-ab*C.y)/denom);
      const s = (bc + ca + ab) / 2;
      const r = Math.sqrt(Math.max(0, s*(s-bc)*(s-ca)/(s-ab)));
      const cs = pts[0].coordsys;
      const center = makePoint(cs, cs.defaultToRelative(Ex), 1);
      return makeGeoCircle(center, r);
    });

    env.set('orthocenter', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isTriangleGeo(a)) { pts.push(a.A, a.B, a.C); break; }
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
      }
      if (pts.length < 3) return null;
      const A = locatePoint(pts[0]), B = locatePoint(pts[1]), C = locatePoint(pts[2]);
      // H = A + B + C - 2*circumcenter
      const D = 2*(A.x*(B.y-C.y)+B.x*(C.y-A.y)+C.x*(A.y-B.y));
      if (Math.abs(D) < 1e-12) return null;
      const ux = ((A.x*A.x+A.y*A.y)*(B.y-C.y)+(B.x*B.x+B.y*B.y)*(C.y-A.y)+(C.x*C.x+C.y*C.y)*(A.y-B.y))/D;
      const uy = ((A.x*A.x+A.y*A.y)*(C.x-B.x)+(B.x*B.x+B.y*B.y)*(A.x-C.x)+(C.x*C.x+C.y*C.y)*(B.x-A.x))/D;
      const H = makePair(A.x+B.x+C.x - 2*ux, A.y+B.y+C.y - 2*uy);
      const cs = pts[0].coordsys;
      return makePoint(cs, cs.defaultToRelative(H), 1);
    });

    // altitude(vertex V, triangle t) — altitude from vertex
    env.set('altitude', (...args) => {
      // Accept: vertex point + opposite side (line or triangle)
      let V = null, tri = null, oppLine = null;
      for (const a of args) {
        if (isTriangleGeo(a)) tri = a;
        else if (isGeoLine(a)) oppLine = a;
        else if (isPoint(a)) V = a;
      }
      if (tri && V) {
        const Vl = locatePoint(V);
        const verts = [locatePoint(tri.A), locatePoint(tri.B), locatePoint(tri.C)];
        // Find which vertex V is closest to
        let minD = Infinity, idx = 0;
        for (let i = 0; i < 3; i++) {
          const d = (Vl.x-verts[i].x)*(Vl.x-verts[i].x)+(Vl.y-verts[i].y)*(Vl.y-verts[i].y);
          if (d < minD) { minD = d; idx = i; }
        }
        const A = verts[(idx+1)%3], B = verts[(idx+2)%3];
        const dx = B.x-A.x, dy = B.y-A.y;
        const t = ((Vl.x-A.x)*dx+(Vl.y-A.y)*dy)/(dx*dx+dy*dy);
        const F = makePair(A.x+t*dx, A.y+t*dy);
        const cs = V.coordsys;
        return makeGeoLine(V, makePoint(cs, cs.defaultToRelative(F), 1), false, false);
      }
      return null;
    });

    // median(vertex V, triangle t)
    env.set('median', (...args) => {
      let V = null, tri = null;
      for (const a of args) {
        if (isTriangleGeo(a)) tri = a;
        else if (isPoint(a)) V = a;
      }
      if (tri && V) {
        const Vl = locatePoint(V);
        const verts = [locatePoint(tri.A), locatePoint(tri.B), locatePoint(tri.C)];
        let minD = Infinity, idx = 0;
        for (let i = 0; i < 3; i++) {
          const d = (Vl.x-verts[i].x)*(Vl.x-verts[i].x)+(Vl.y-verts[i].y)*(Vl.y-verts[i].y);
          if (d < minD) { minD = d; idx = i; }
        }
        const A = verts[(idx+1)%3], B = verts[(idx+2)%3];
        const M = makePair((A.x+B.x)/2, (A.y+B.y)/2);
        const cs = V.coordsys;
        return makeGeoLine(V, makePoint(cs, cs.defaultToRelative(M), 1), false, true);
      }
      return null;
    });

    // bisector(point A, point O, point B) or bisector(line l) [perpendicular bisector]
    env.set('bisector', (...args) => {
      const pts = [];
      let l = null;
      for (const a of args) {
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) {
          const cs = env.get('currentcoordsys') || defaultCS;
          pts.push(makePoint(cs, a, 1));
        }
        else if (isGeoLine(a)) l = a;
      }
      // Perpendicular bisector of segment/line
      if (l) {
        const A = locatePoint(l.A), B = locatePoint(l.B);
        const M = makePair((A.x+B.x)/2, (A.y+B.y)/2);
        const dx = B.x-A.x, dy = B.y-A.y;
        const P2 = makePair(M.x - dy, M.y + dx);
        const cs = l.A.coordsys;
        return makeGeoLine(makePoint(cs, cs.defaultToRelative(M), 1), makePoint(cs, cs.defaultToRelative(P2), 1), true, true);
      }
      // Angle bisector: bisector(A, O, B) — bisects angle AOB
      if (pts.length >= 3) {
        const A = locatePoint(pts[0]), O = locatePoint(pts[1]), B = locatePoint(pts[2]);
        const dA = Math.sqrt((A.x-O.x)*(A.x-O.x)+(A.y-O.y)*(A.y-O.y)) || 1;
        const dB = Math.sqrt((B.x-O.x)*(B.x-O.x)+(B.y-O.y)*(B.y-O.y)) || 1;
        const uA = makePair((A.x-O.x)/dA, (A.y-O.y)/dA);
        const uB = makePair((B.x-O.x)/dB, (B.y-O.y)/dB);
        const bisDir = makePair(uA.x+uB.x, uA.y+uB.y);
        const P2 = makePair(O.x+bisDir.x, O.y+bisDir.y);
        const cs = pts[1].coordsys;
        return makeGeoLine(pts[1], makePoint(cs, cs.defaultToRelative(P2), 1), true, true);
      }
      // Perpendicular bisector of two points
      if (pts.length >= 2) {
        const A = locatePoint(pts[0]), B = locatePoint(pts[1]);
        const M = makePair((A.x+B.x)/2, (A.y+B.y)/2);
        const dx = B.x-A.x, dy = B.y-A.y;
        const P2 = makePair(M.x - dy, M.y + dx);
        const cs = pts[0].coordsys;
        return makeGeoLine(makePoint(cs, cs.defaultToRelative(M), 1), makePoint(cs, cs.defaultToRelative(P2), 1), true, true);
      }
      return null;
    });

    // ────────────────────────────────────────────────────────────
    // Transforms
    // ────────────────────────────────────────────────────────────

    // reflect(line l) → transform (reflection about line)
    const existingReflect = env.get('reflect');
    env.set('reflect', (...args) => {
      // If args are geolines, reflect about line
      if (args.length === 1 && isGeoLine(args[0])) {
        const A = locatePoint(args[0].A), B = locatePoint(args[0].B);
        const dx = B.x-A.x, dy = B.y-A.y;
        const d2 = dx*dx+dy*dy;
        if (d2 < 1e-12) return makeTransform(0,1,0,0,0,1);
        // Reflection matrix about line through A with direction (dx,dy)
        const cos2 = (dx*dx-dy*dy)/d2, sin2 = 2*dx*dy/d2;
        // T = translate(-A) * reflect * translate(A)
        const tx = A.x - cos2*A.x - sin2*A.y;
        const ty = A.y - sin2*A.x + cos2*A.y;
        return makeTransform(tx, cos2, sin2, ty, sin2, -cos2);
      }
      // Fall back to existing reflect(pair, pair)
      if (typeof existingReflect === 'function') return existingReflect(...args);
      // Default: reflect about two points
      if (args.length >= 2) {
        const A = toPair(args[0]), B = toPair(args[1]);
        const dx = B.x-A.x, dy = B.y-A.y;
        const d2 = dx*dx+dy*dy;
        if (d2 < 1e-12) return makeTransform(0,1,0,0,0,1);
        const cos2 = (dx*dx-dy*dy)/d2, sin2 = 2*dx*dy/d2;
        const tx = A.x - cos2*A.x - sin2*A.y;
        const ty = A.y - sin2*A.x + cos2*A.y;
        return makeTransform(tx, cos2, sin2, ty, sin2, -cos2);
      }
      return makeTransform(0,1,0,0,0,1);
    });

    // projection(line l) → transform (orthogonal projection on line)
    env.set('projection', (...args) => {
      if (args.length === 1 && isGeoLine(args[0])) {
        const A = locatePoint(args[0].A), B = locatePoint(args[0].B);
        const dx = B.x-A.x, dy = B.y-A.y;
        const d2 = dx*dx+dy*dy;
        if (d2 < 1e-12) return makeTransform(0,1,0,0,0,1);
        const c2 = dx*dx/d2, s2 = dx*dy/d2;
        const tx = A.x - c2*A.x - s2*A.y;
        const ty = A.y - s2*A.x - (dy*dy/d2)*A.y + (dy*dy/d2)*A.y;
        // Projection: P = A + ((X-A)·u)u  where u = (dx,dy)/|d|
        // As transform: [c², cs; cs, s²] * X + (I - M)*A
        const cs2 = dx*dy/d2, ss = dy*dy/d2;
        return makeTransform(
          A.x*(1-c2) - A.y*cs2, c2, cs2,
          A.y*(1-ss) - A.x*cs2, cs2, ss
        );
      }
      // projection(point A, point B) → same as projection(line(A,B))
      if (args.length >= 2) {
        const A = toPair(args[0]), B = toPair(args[1]);
        const dx = B.x-A.x, dy = B.y-A.y;
        const d2 = dx*dx+dy*dy;
        if (d2 < 1e-12) return makeTransform(0,1,0,0,0,1);
        const c2 = dx*dx/d2, cs2 = dx*dy/d2, ss = dy*dy/d2;
        return makeTransform(
          A.x*(1-c2) - A.y*cs2, c2, cs2,
          A.y*(1-ss) - A.x*cs2, cs2, ss
        );
      }
      return makeTransform(0,1,0,0,0,1);
    });

    // ────────────────────────────────────────────────────────────
    // Distance / length / abs for geometry types
    // ────────────────────────────────────────────────────────────

    // Enhance abs to handle points/vectors
    const existingAbs = env.get('abs');
    env.set('abs', (...args) => {
      const v = args[0];
      if (isPoint(v)) {
        // abs in M's own coordinate system metric
        return Math.sqrt(v.x*v.x + v.y*v.y);
      }
      if (isGeoVector(v)) {
        const d = locateVector(v);
        return Math.sqrt(d.x*d.x + d.y*d.y);
      }
      if (typeof existingAbs === 'function') return existingAbs(...args);
      return Math.abs(toNumber(args[0]));
    });

    // length for geometry types
    const existingLength = env.get('length');
    env.set('length', (...args) => {
      const v = args[0];
      if (isGeoLine(v) && !v.extendA && !v.extendB) {
        // segment length
        const A = locatePoint(v.A), B = locatePoint(v.B);
        return Math.sqrt((B.x-A.x)*(B.x-A.x) + (B.y-A.y)*(B.y-A.y));
      }
      if (isPoint(v)) return Math.sqrt(v.x*v.x + v.y*v.y);
      if (isGeoVector(v)) {
        const d = locateVector(v);
        return Math.sqrt(d.x*d.x + d.y*d.y);
      }
      if (typeof existingLength === 'function') return existingLength(...args);
      if (isPath(v)) return v.segs.length;
      if (isArray(v)) return v.length;
      if (isString(v)) return v.length;
      return 0;
    });

    // unit(point/vector) → unit vector in default coords direction
    const existingUnit = env.get('unit');
    env.set('unit', (...args) => {
      const v = args[0];
      if (isGeoVector(v)) {
        const d = locateVector(v);
        const len = Math.sqrt(d.x*d.x + d.y*d.y);
        if (len < 1e-12) return makeGeoVector(v.v.coordsys, makePair(0,0));
        const _defaultCS = makeCoordSys(makePair(0,0), makePair(1,0), makePair(0,1));
        return makeGeoVector(_defaultCS, makePair(d.x/len, d.y/len));
      }
      if (isPoint(v)) {
        const p = locatePoint(v);
        const len = Math.sqrt(p.x*p.x + p.y*p.y);
        if (len < 1e-12) return makePair(0,0);
        return makePair(p.x/len, p.y/len);
      }
      if (typeof existingUnit === 'function') return existingUnit(...args);
      if (isPair(v)) {
        const len = Math.sqrt(v.x*v.x + v.y*v.y);
        return len > 0 ? makePair(v.x/len, v.y/len) : makePair(0,0);
      }
      return makePair(0,0);
    });

    // degrees/angle for geometry types
    const existingDegrees = env.get('degrees');
    env.set('degrees', (...args) => {
      const v = args[0];
      if (isGeoVector(v)) {
        const d = locateVector(v);
        return Math.atan2(d.y, d.x) * 180 / Math.PI;
      }
      if (isPoint(v)) {
        const p = locatePoint(v);
        return Math.atan2(p.y, p.x) * 180 / Math.PI;
      }
      if (typeof existingDegrees === 'function') return existingDegrees(...args);
      if (isPair(v)) return Math.atan2(v.y, v.x) * 180 / Math.PI;
      return toNumber(v) * 180 / Math.PI;
    });

    // ────────────────────────────────────────────────────────────
    // NOTE: draw/fill/filldraw/dot/label handle geometry types
    // directly via conversion in evalDraw/evalDot/evalLabel.
    // ────────────────────────────────────────────────────────────

    // ────────────────────────────────────────────────────────────
    // Predicate functions
    // ────────────────────────────────────────────────────────────

    env.set('collinear', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isPoint(a)) pts.push(locatePoint(a));
        else if (isPair(a)) pts.push(a);
        else if (isGeoVector(a)) pts.push(locateVector(a));
      }
      if (pts.length >= 3) {
        const A = pts[0], B = pts[1], C = pts[2];
        return Math.abs((B.x-A.x)*(C.y-A.y) - (C.x-A.x)*(B.y-A.y)) < 1e-10;
      }
      if (pts.length === 2) {
        // Two vectors: check if parallel
        return Math.abs(pts[0].x*pts[1].y - pts[0].y*pts[1].x) < 1e-10;
      }
      return false;
    });

    env.set('sameside', (...args) => {
      const pts = [];
      let l = null;
      for (const a of args) {
        if (isPoint(a)) pts.push(locatePoint(a));
        else if (isPair(a)) pts.push(a);
        else if (isGeoLine(a)) l = a;
      }
      if (l && pts.length >= 2) {
        const A = locatePoint(l.A), B = locatePoint(l.B);
        const dx = B.x-A.x, dy = B.y-A.y;
        const s1 = (pts[0].x-A.x)*dy - (pts[0].y-A.y)*dx;
        const s2 = (pts[1].x-A.x)*dy - (pts[1].y-A.y)*dx;
        return s1*s2 > 0;
      }
      if (pts.length >= 3) {
        // sameside(M, N, O): M and N on same side of O
        const M = pts[0], N = pts[1], O = pts[2];
        return (M.x-O.x)*(N.x-O.x) + (M.y-O.y)*(N.y-O.y) > 0;
      }
      return false;
    });

    // ────────────────────────────────────────────────────────────
    // Distance function (visual measurement)
    // ────────────────────────────────────────────────────────────

    // distance(point M, line l) → real
    // (Not the visual distance() that draws measurement arrows)
    const existingDistance = env.get('distance');
    env.set('distance', (...args) => {
      let pt = null, l = null;
      for (const a of args) {
        if (isPoint(a) && !pt) pt = a;
        else if (isPair(a) && !pt) pt = makePoint(defaultCS, a, 1);
        else if (isGeoLine(a)) l = a;
      }
      if (pt && l) {
        const M = locatePoint(pt);
        const A = locatePoint(l.A), B = locatePoint(l.B);
        const dx = B.x-A.x, dy = B.y-A.y;
        const d2 = dx*dx+dy*dy;
        if (d2 < 1e-12) return Math.sqrt((M.x-A.x)*(M.x-A.x)+(M.y-A.y)*(M.y-A.y));
        return Math.abs((M.x-A.x)*dy - (M.y-A.y)*dx) / Math.sqrt(d2);
      }
      // distance(point, point) → Euclidean distance
      const pts = [];
      for (const a of args) {
        if (isPoint(a)) pts.push(locatePoint(a));
        else if (isPair(a)) pts.push(a);
      }
      if (pts.length >= 2) {
        const dx = pts[1].x-pts[0].x, dy = pts[1].y-pts[0].y;
        return Math.sqrt(dx*dx+dy*dy);
      }
      if (typeof existingDistance === 'function') return existingDistance(...args);
      return 0;
    });

    // ────────────────────────────────────────────────────────────
    // Perpendicular mark / right angle mark
    // ────────────────────────────────────────────────────────────

    env.set('perpendicularmark', (...args) => {
      let target = currentPic;
      if (args.length > 0 && args[0] && args[0]._tag === 'picture') {
        target = args[0]; args = args.slice(1);
      }
      let z = null, alignDir = null, dir = null, sz = 10, pen = null;
      for (const a of args) {
        if (isPoint(a) && !z) z = locatePoint(a);
        else if (isPair(a)) {
          if (!z) z = a;
          else if (!alignDir) alignDir = a;
          else if (!dir) dir = a;
        }
        else if (typeof a === 'number') sz = a;
        else if (isPen(a)) pen = a;
        else if (isGeoVector(a)) {
          if (!alignDir) alignDir = locateVector(a);
          else if (!dir) dir = locateVector(a);
        }
      }
      if (!z || !alignDir) return;
      if (!dir) dir = makePair(-alignDir.y, alignDir.x);
      if (!pen) pen = clonePen(defaultPen);
      // Draw the right angle mark (small square corner)
      const s = sz / 28.35; // convert from bp to user units approximately
      const uA = {x: alignDir.x, y: alignDir.y};
      const uD = {x: dir.x, y: dir.y};
      const lA = Math.sqrt(uA.x*uA.x+uA.y*uA.y) || 1;
      const lD = Math.sqrt(uD.x*uD.x+uD.y*uD.y) || 1;
      const nA = {x: uA.x/lA*s, y: uA.y/lA*s};
      const nD = {x: uD.x/lD*s, y: uD.y/lD*s};
      const p1 = makePair(z.x+nA.x, z.y+nA.y);
      const p2 = makePair(z.x+nA.x+nD.x, z.y+nA.y+nD.y);
      const p3 = makePair(z.x+nD.x, z.y+nD.y);
      const path = makePath([lineSegment(p1,p2), lineSegment(p2,p3)], false);
      target.commands.push({cmd:'draw', path, pen, arrow:null, line:0});
    });

    env.set('markrightangle', (...args) => {
      let target = currentPic;
      if (args.length > 0 && args[0] && args[0]._tag === 'picture') {
        target = args[0]; args = args.slice(1);
      }
      const pts = [];
      let sz = 10, pen = null;
      for (const a of args) {
        if (isPoint(a)) pts.push(locatePoint(a));
        else if (isPair(a)) pts.push(a);
        else if (typeof a === 'number') sz = a;
        else if (isPen(a)) pen = a;
      }
      if (pts.length < 3) return;
      if (!pen) pen = clonePen(defaultPen);
      const A = pts[0], O = pts[1], B = pts[2];
      const s = sz / 28.35;
      const dA = Math.sqrt((A.x-O.x)*(A.x-O.x)+(A.y-O.y)*(A.y-O.y)) || 1;
      const dB = Math.sqrt((B.x-O.x)*(B.x-O.x)+(B.y-O.y)*(B.y-O.y)) || 1;
      const uA = {x:(A.x-O.x)/dA*s, y:(A.y-O.y)/dA*s};
      const uB = {x:(B.x-O.x)/dB*s, y:(B.y-O.y)/dB*s};
      const p1 = makePair(O.x+uA.x, O.y+uA.y);
      const p2 = makePair(O.x+uA.x+uB.x, O.y+uA.y+uB.y);
      const p3 = makePair(O.x+uB.x, O.y+uB.y);
      const path = makePath([lineSegment(p1,p2), lineSegment(p2,p3)], false);
      target.commands.push({cmd:'draw', path, pen, arrow:null, line:0});
    });

    // ────────────────────────────────────────────────────────────
    // Stubs for less-common features
    // ────────────────────────────────────────────────────────────

    // inversion — circle inversion (non-affine transform)
    env.set('inversion', (...args) => {
      // inversion(real k, pair c) or inversion(pair c, real k)
      // Asymptote convention: inversion(real k, pair c)
      let k = 1, center = makePair(0,0);
      for (const a of args) {
        if (typeof a === 'number') k = a;
        else if (isPair(a)) center = a;
        else if (isPoint(a)) center = locatePoint(a);
      }
      return makeInversion(k, center);
    });

    // mass, abscissa, bqe — stub types
    env.set('mass', (...args) => {
      const pts = [];
      let m = 1;
      for (const a of args) {
        if (isPoint(a)) pts.push(a);
        else if (isPair(a)) pts.push(makePoint(defaultCS, a, 1));
        else if (typeof a === 'number') m = a;
      }
      if (pts.length > 0) return makePoint(pts[0].coordsys, pts[0].coordinates, m);
      return null;
    });

    env.set('masscenter', (...args) => {
      // masscenter(point[] P) — weighted average
      const pts = [];
      for (const a of args) {
        if (isArray(a)) {
          for (const p of a) { if (isPoint(p)) pts.push(p); }
        }
        else if (isPoint(a)) pts.push(a);
      }
      if (pts.length === 0) return null;
      let totalM = 0, sx = 0, sy = 0;
      for (const p of pts) {
        const loc = locatePoint(p);
        totalM += p.m;
        sx += p.m * loc.x;
        sy += p.m * loc.y;
      }
      if (totalM < 1e-12) return null;
      const cs = pts[0].coordsys;
      return makePoint(cs, cs.defaultToRelative(makePair(sx/totalM, sy/totalM)), totalM);
    });

    // Stub for trilinear
    env.set('trilinear', (...args) => null);

    // rotateO, scaleO — transforms relative to currentcoordsys origin
    env.set('rotateO', (deg) => {
      const R = env.get('currentcoordsys') || defaultCS;
      const O = R.O;
      const rad = toNumber(deg) * Math.PI / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      return makeTransform(O.x - c*O.x + s*O.y, c, -s, O.y - s*O.x - c*O.y, s, c);
    });

    env.set('scaleO', (k) => {
      const R = env.get('currentcoordsys') || defaultCS;
      const O = R.O;
      const kk = toNumber(k);
      return makeTransform(O.x*(1-kk), kk, 0, O.y*(1-kk), 0, kk);
    });

    // ────────────────────────────────────────────────────────────
    // Conversion helpers accessible to user code
    // ────────────────────────────────────────────────────────────

    env.set('samecoordsys', (...args) => {
      const pts = [];
      for (const a of args) {
        if (isArray(a)) { for (const p of a) if (isPoint(p)) pts.push(p); }
        else if (isPoint(a)) pts.push(a);
      }
      if (pts.length < 2) return true;
      const first = pts[0].coordsys;
      return pts.every(p => p.coordsys === first ||
        (Math.abs(p.coordsys.O.x-first.O.x)<1e-10 && Math.abs(p.coordsys.O.y-first.O.y)<1e-10 &&
         Math.abs(p.coordsys.i.x-first.i.x)<1e-10 && Math.abs(p.coordsys.i.y-first.i.y)<1e-10 &&
         Math.abs(p.coordsys.j.x-first.j.x)<1e-10 && Math.abs(p.coordsys.j.y-first.j.y)<1e-10));
    });

    // ────────────────────────────────────────────────────────────
    // Boolean / membership
    // ────────────────────────────────────────────────────────────

    // inside(path, pair) — already in stdlib; add geometry overloads
    // degenerate(circle) — true if radius is infinite
    env.set('degenerate', (c) => {
      if (isGeoCircle(c)) return !isFinite(c.r);
      return false;
    });
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

      // Grid lines (exclude boundary lines to avoid drawing a rectangular border)
      if (usegrid) {
        const gridPen = makePen({r:0.75,g:0.75,b:0.75, linewidth:0.4});
        for (let i = xleft + xstep; i < xright; i += xstep) {
          if (Math.abs(i) > 0.01) {
            const path = makePath([lineSegment({x:i,y:ybottom},{x:i,y:ytop})], false);
            pic.commands.push({cmd:'draw', path, pen:gridPen, arrow:null, line:0});
          }
        }
        for (let i = ybottom + ystep; i < ytop; i += ystep) {
          if (Math.abs(i) > 0.01) {
            const path = makePath([lineSegment({x:xleft,y:i},{x:xright,y:i})], false);
            pic.commands.push({cmd:'draw', path, pen:gridPen, arrow:null, line:0});
          }
        }
      }

      // Draw axis lines with arrows
      const axArrow = {_tag:'arrow', style:'Arrows', size: axisarrowsize};
      // Vertical axis (x=0)
      const vPath = makePath([lineSegment({x:0,y:ybottom},{x:0,y:ytop})], false);
      pic.commands.push({cmd:'draw', path:vPath, pen:clonePen(axisPen), arrow:axArrow, line:0});
      // Horizontal axis (y=0)
      const hPath = makePath([lineSegment({x:xleft,y:0},{x:xright,y:0})], false);
      pic.commands.push({cmd:'draw', path:hPath, pen:clonePen(axisPen), arrow:axArrow, line:0});

      // Tick marks (no numeric labels — labels are added by user code)
      if (useticks) {
        for (let i = xleft + xstep; i < xright; i += xstep) {
          const iv = Math.round(i * 1000) / 1000;
          if (Math.abs(iv) < 0.01) continue;
          const tPath = makePath([lineSegment({x:iv,y:-0.15},{x:iv,y:0.15})], false);
          pic.commands.push({cmd:'draw', path:tPath, pen:makePen({r:0,g:0,b:0,linewidth:0.8}), arrow:null, line:0});
        }
        for (let i = ybottom + ystep; i < ytop; i += ystep) {
          const iv = Math.round(i * 1000) / 1000;
          if (Math.abs(iv) < 0.01) continue;
          const tPath = makePath([lineSegment({x:-0.15,y:iv},{x:0.15,y:iv})], false);
          pic.commands.push({cmd:'draw', path:tPath, pen:makePen({r:0,g:0,b:0,linewidth:0.8}), arrow:null, line:0});
        }
      }
    });

    // ── trig_axes(xleft, xright, ybottom, ytop, xstep, ystep) ──────
    // Draws trig-style axes with grid, tick marks, and π-formatted
    // labels on the x-axis and integer labels on the y-axis.
    env.set('trig_axes', (...args) => {
      const nums = [];
      for (const a of args) {
        if (typeof a === 'number') nums.push(a);
      }
      const xleft   = nums.length >= 1 ? nums[0] : -3 * Math.PI;
      const xright  = nums.length >= 2 ? nums[1] :  3 * Math.PI;
      const ybottom = nums.length >= 3 ? nums[2] : -3;
      const ytop    = nums.length >= 4 ? nums[3] :  3;
      const xstep   = nums.length >= 5 ? nums[4] : Math.PI / 2;
      const ystep   = nums.length >= 6 ? nums[5] : 1;

      const pic = currentPic;

      // Store state so rm_trig_labels can modify labels later
      pic._trigAxesState = { xleft, xright, ybottom, ytop, xstep, ystep };

      // Set axis limits
      if (_axisLimits.xmin === null || xleft  < _axisLimits.xmin) _axisLimits.xmin = xleft;
      if (_axisLimits.xmax === null || xright > _axisLimits.xmax) _axisLimits.xmax = xright;
      if (_axisLimits.ymin === null || ybottom < _axisLimits.ymin) _axisLimits.ymin = ybottom;
      if (_axisLimits.ymax === null || ytop    > _axisLimits.ymax) _axisLimits.ymax = ytop;

      // ── Grid lines ──
      const gridPen = makePen({r:0.75, g:0.75, b:0.75, linewidth:0.4});
      for (let x = xleft + xstep; x < xright - xstep * 0.01; x += xstep) {
        if (Math.abs(x) > 0.01) {
          const path = makePath([lineSegment({x, y:ybottom}, {x, y:ytop})], false);
          pic.commands.push({cmd:'draw', path, pen:clonePen(gridPen), arrow:null, line:0});
        }
      }
      for (let y = ybottom + ystep; y < ytop - ystep * 0.01; y += ystep) {
        if (Math.abs(y) > 0.01) {
          const path = makePath([lineSegment({x:xleft, y}, {x:xright, y})], false);
          pic.commands.push({cmd:'draw', path, pen:clonePen(gridPen), arrow:null, line:0});
        }
      }

      // ── Axis lines with arrows ──
      const axArrow = {_tag:'arrow', style:'Arrows', size: axisarrowsize};
      const vPath = makePath([lineSegment({x:0, y:ybottom}, {x:0, y:ytop})], false);
      pic.commands.push({cmd:'draw', path:vPath, pen:clonePen(axisPen), arrow:axArrow, line:0});
      const hPath = makePath([lineSegment({x:xleft, y:0}, {x:xright, y:0})], false);
      pic.commands.push({cmd:'draw', path:hPath, pen:clonePen(axisPen), arrow:axArrow, line:0});

      // ── Helper: GCD for simplifying fractions ──
      function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

      // ── Helper: format tick index n as a LaTeX π-label ──
      // xstep = piNum * π / piDen  (rational multiple of π)
      // position = n * xstep = n * piNum * π / piDen
      const piRatio = xstep / Math.PI;          // e.g. 0.5 for π/2
      // Find piNum / piDen ≈ piRatio with small denominator
      let piDen = 1;
      for (let d = 1; d <= 12; d++) {
        if (Math.abs(piRatio * d - Math.round(piRatio * d)) < 0.001) { piDen = d; break; }
      }
      const piNum = Math.round(piRatio * piDen); // e.g. piNum=1, piDen=2 for π/2

      function formatPiLabel(n) {
        let num = n * piNum;
        let den = piDen;
        const g = gcd(Math.abs(num), den);
        num /= g;
        den /= g;
        const sign = num < 0 ? '-' : '';
        const absNum = Math.abs(num);
        if (den === 1) {
          if (absNum === 1) return '$' + sign + '\\pi$';
          return '$' + sign + absNum + '\\pi$';
        }
        if (absNum === 1) return '$' + sign + '\\frac{\\pi}{' + den + '}$';
        return '$' + sign + '\\frac{' + absNum + '\\pi}{' + den + '}$';
      }

      // ── Tick marks & labels on x-axis ──
      const tickPen = makePen({r:0, g:0, b:0, linewidth:0.8});
      const labelPen = clonePen(defaultPen);
      labelPen.fontsize = 8;
      for (let x = xleft; x <= xright + xstep * 0.01; x += xstep) {
        if (Math.abs(x) < 0.01) continue;
        if (x < xleft - 0.001 || x > xright + 0.001) continue;
        // tick
        const tPath = makePath([lineSegment({x, y:-0.15}, {x, y:0.15})], false);
        pic.commands.push({cmd:'draw', path:tPath, pen:clonePen(tickPen), arrow:null, line:0});
        // label (positioned below the tick mark, not on the axis)
        const n = Math.round(x / xstep);
        pic.commands.push({
          cmd:'label', text:formatPiLabel(n), pos:{x, y:-0.35},
          align:{x:0, y:-1}, pen:clonePen(labelPen), line:0,
          _trigXLabel:true, _trigIndex:n
        });
      }

      // ── Tick marks on y-axis (no labels, matching TeXeR TrigMacros) ──
      for (let y = ybottom; y <= ytop + ystep * 0.01; y += ystep) {
        if (Math.abs(y) < 0.01) continue;
        if (y < ybottom - 0.001 || y > ytop + 0.001) continue;
        const tPath = makePath([lineSegment({x:-0.15, y}, {x:0.15, y})], false);
        pic.commands.push({cmd:'draw', path:tPath, pen:clonePen(tickPen), arrow:null, line:0});
      }

      // ── Axis labels "x" and "y" ──
      const axisLabelPen = clonePen(defaultPen);
      axisLabelPen.fontsize = 10;
      pic.commands.push({
        cmd:'label', text:'$x$', pos:{x:xright, y:0},
        align:{x:1, y:0}, pen:clonePen(axisLabelPen), line:0
      });
      pic.commands.push({
        cmd:'label', text:'$y$', pos:{x:0, y:ytop},
        align:{x:0, y:1}, pen:clonePen(axisLabelPen), line:0
      });
    });

    // ── rm_trig_labels(nmin, nmax, step) ─────────────────────────
    // In real AoPS TrigMacros, this removes labels outside the visible
    // range while keeping all labels within. The x-axis labels placed
    // by trig_axes at every xstep remain visible.
    env.set('rm_trig_labels', (...args) => {
      const nums = [];
      for (const a of args) {
        if (typeof a === 'number') nums.push(a);
      }
      const nmin = nums.length >= 1 ? nums[0] : -5;
      const nmax = nums.length >= 2 ? nums[1] :  5;

      const pic = currentPic;
      pic.commands = pic.commands.filter(cmd => {
        if (!cmd._trigXLabel) return true;          // keep non-trig commands
        const n = cmd._trigIndex;
        return (n >= nmin && n <= nmax);             // keep labels inside range
      });
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
    // Floating-point epsilon constants used by 3D/graph modules
    env.set('realEpsilon', 2.22044604925031e-16);
    env.set('sqrtEpsilon', 1.4901161193847656e-8);
    env.set('mantissaBits', 53);

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

    // Projection constructors — support graph3-style named args:
    //   perspective/orthographic(camera=triple, up=triple, target=triple,
    //                            zoom=real, autoadjust=bool, center=bool)
    // plus the traditional positional (cx, cy, cz) or (triple camera, triple up).
    function buildProjection(type, args) {
      const pos = args.filter(a => !(a && a._named));
      const named = {};
      for (const a of args) if (a && a._named) Object.assign(named, a);
      // Defaults
      let cx, cy, cz;
      if (type === 'perspective') { cx = 5; cy = 4; cz = 2; }
      else                        { cx = 1; cy = -2; cz = 0.5; }
      let ux = 0, uy = 0, uz = 1;
      const nums = pos.filter(a => typeof a === 'number');
      if (nums.length >= 3) { cx = nums[0]; cy = nums[1]; cz = nums[2]; }
      else if (pos.length >= 1 && isTriple(pos[0])) { cx = pos[0].x; cy = pos[0].y; cz = pos[0].z; }
      if (pos.length >= 2 && isTriple(pos[1])) { ux = pos[1].x; uy = pos[1].y; uz = pos[1].z; }
      // Named args override / supply
      if (named.camera && isTriple(named.camera)) { cx = named.camera.x; cy = named.camera.y; cz = named.camera.z; }
      if (named.up && isTriple(named.up))         { ux = named.up.x; uy = named.up.y; uz = named.up.z; }
      let tx = 0, ty = 0, tz = 0;
      if (named.target && isTriple(named.target)) { tx = named.target.x; ty = named.target.y; tz = named.target.z; }
      const zoom = (typeof named.zoom === 'number') ? named.zoom : 1;
      const autoadjust = ('autoadjust' in named) ? !!named.autoadjust : true;
      const center = !!named.center;
      return {_tag:'projection', type, cx, cy, cz, tx, ty, tz, ux, uy, uz,
              zoom, autoadjust, center};
    }
    env.set('orthographic', (...args) => buildProjection('orthographic', args));
    env.set('perspective',  (...args) => buildProjection('perspective',  args));

    env.set('oblique', (...args) => {
      return {_tag:'projection', type:'orthographic', cx:0, cy:-1, cz:0.5, tx:0, ty:0, tz:0, ux:0, uy:0, uz:1};
    });

    // currentprojection — set default if not already set.
    // Matches Asymptote's three.asy default camera position (5,4,2) so
    // scenes without an explicit currentprojection render from the same
    // yaw as the standalone Asymptote renderer / TeXeR. We keep
    // orthographic (rather than perspective) for consistency with HTX's
    // simpler projection pipeline.
    if (!projection) {
      projection = {_tag:'projection', type:'orthographic', cx:5, cy:4, cz:2, tx:0, ty:0, tz:0, ux:0, uy:0, uz:1};
      env.set('currentprojection', projection);
    }

    // 3D math functions / 2D marker cross
    env.set('cross', (...args) => {
      // cross(int n) — marker path: n-pointed asterisk (from plain_markers.asy)
      if (args.length <= 1 || (args.length === 2 && typeof args[1] === 'boolean')) {
        const n = (args.length >= 1 && typeof args[0] === 'number') ? args[0] : 4;
        const segs = [];
        for (let i = 0; i < n; i++) {
          const angle = i * Math.PI / n;
          const dx = Math.cos(angle), dy = Math.sin(angle);
          segs.push(lineSegment(makePair(-dx, -dy), makePair(dx, dy)));
        }
        return makePath(segs, false);
      }
      // cross(triple, triple) — 3D vector cross product
      const u = toTriple(args[0]), v = toTriple(args[1]);
      return makeTriple(u.y*v.z - u.z*v.y, u.z*v.x - u.x*v.z, u.x*v.y - u.y*v.x);
    });

    env.set('normal', (a, b, c) => {
      // Normal to plane through three points
      const u = toTriple(a), v = toTriple(b), w = toTriple(c);
      const dx1 = v.x-u.x, dy1 = v.y-u.y, dz1 = v.z-u.z;
      const dx2 = w.x-u.x, dy2 = w.y-u.y, dz2 = w.z-u.z;
      return makeTriple(dy1*dz2-dz1*dy2, dz1*dx2-dx1*dz2, dx1*dy2-dy1*dx2);
    });

    // Component accessors
    env.set('xpart', v => isTriple(v) ? v.x : (isPair(v) ? v.x : toNumber(v)));
    env.set('ypart', v => isTriple(v) ? v.y : (isPair(v) ? v.y : 0));
    env.set('zpart', v => isTriple(v) ? v.z : 0);

    // 3D path type stubs
    env.set('path3', null);

    // unitcircle3: 3D unit circle in XY plane (4 cubic Bezier segments with triple endpoints)
    {
      const K3 = 0.5522847498;
      env.set('unitcircle3', makePath([
        makeSeg(makeTriple(1,0,0), makeTriple(1,K3,0), makeTriple(K3,1,0), makeTriple(0,1,0)),
        makeSeg(makeTriple(0,1,0), makeTriple(-K3,1,0), makeTriple(-1,K3,0), makeTriple(-1,0,0)),
        makeSeg(makeTriple(-1,0,0), makeTriple(-1,-K3,0), makeTriple(-K3,-1,0), makeTriple(0,-1,0)),
        makeSeg(makeTriple(0,-1,0), makeTriple(K3,-1,0), makeTriple(1,-K3,0), makeTriple(1,0,0)),
      ], true));
    }

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
      // Fallback to 2D circle - use proper geometry circle
      if (args.length >= 2) {
        const center = args[0];
        const radius = toNumber(args[1]);
        return makeGeoCircle(center, radius);
      }
      // If insufficient arguments, return null
      return null;
    });

    // shift for triples → transform3
    const origShift = env.get('shift');
    env.set('shift', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      if (pos.length === 1 && isTriple(pos[0])) {
        return shiftT3(pos[0].x, pos[0].y, pos[0].z);
      }
      if (pos.length === 3 && typeof pos[0] === 'number') {
        return shiftT3(pos[0], pos[1], pos[2]);
      }
      if (origShift) return origShift(...args);
      if (pos.length === 2) return makeTransform(pos[0], 1, pos[1], 0, 0, 1);
      if (pos.length === 1 && isPair(pos[0])) return makeTransform(pos[0].x, 1, pos[0].y, 0, 0, 1);
      return makeTransform(0,1,0,0,0,1);
    });

    // scale / scale3 / xscale3 / yscale3 / zscale3
    const origScale = env.get('scale');
    env.set('scale', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      if (pos.length === 3) return scaleT3(toNumber(pos[0]), toNumber(pos[1]), toNumber(pos[2]));
      if (origScale) return origScale(...args);
      const s = toNumber(pos[0]);
      return makeTransform(0, s, 0, 0, 0, s);
    });
    env.set('scale3', (s) => { const n = toNumber(s); return scaleT3(n, n, n); });
    env.set('xscale3', (s) => scaleT3(toNumber(s), 1, 1));
    env.set('yscale3', (s) => scaleT3(1, toNumber(s), 1));
    env.set('zscale3', (s) => scaleT3(1, 1, toNumber(s)));

    // rotate(angle, triple axis) or rotate(angle, triple p, triple q)
    const origRotate = env.get('rotate');
    env.set('rotate', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      if (pos.length >= 2 && typeof pos[0] === 'number' && isTriple(pos[1])) {
        const angle = pos[0];
        if (pos.length >= 3 && isTriple(pos[2])) {
          return rotateT3Line(angle, pos[1], pos[2]);
        }
        return rotateT3(angle, pos[1]);
      }
      if (origRotate) return origRotate(...args);
      // Fallback to 2D rotate
      const a = toNumber(pos[0]) * Math.PI / 180;
      return makeTransform(0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a));
    });

    // Sin/Cos (degree-based trig)
    env.set('Sin', (deg) => Math.sin(toNumber(deg) * Math.PI / 180));
    env.set('Cos', (deg) => Math.cos(toNumber(deg) * Math.PI / 180));
    env.set('Tan', (deg) => Math.tan(toNumber(deg) * Math.PI / 180));

    // (intersectionpoints defined earlier with proper implementation)

    // surface(): wrap mesh, capture boundary path, or tessellate parametric f
    env.set('surface', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      // Triangle-list: surface(triple[][]) where inner array is a triangle of 3 triples
      // (produced by contour3/smoothcontour3 isosurface extraction).
      {
        const firstArr = pos.find(a => Array.isArray(a));
        if (firstArr && firstArr.length > 0 && Array.isArray(firstArr[0]) &&
            firstArr[0].length === 3 && isTriple(firstArr[0][0]) &&
            !Array.isArray(firstArr[0][0])) {
          const faces = [];
          const faceIdx = firstArr._contourFaceIdx || null;
          for (let t = 0; t < firstArr.length; t++) {
            const tri = firstArr[t];
            if (!Array.isArray(tri) || tri.length < 3) continue;
            const f = { vertices: [tri[0], tri[1], tri[2]] };
            if (faceIdx && faceIdx[t]) f._vidx = faceIdx[t];
            f.normal = faceNormal(f);
            faces.push(f);
          }
          if (faces.length > 0) {
            const surf = { _tag: 'surface', mesh: makeMesh(faces) };
            if (firstArr._contourVertices) surf._vertices = firstArr._contourVertices;
            if (firstArr._contourFaceIdx) surf._faceVertexIdx = firstArr._contourFaceIdx;
            return surf;
          }
        }
      }
      // Bezier patch array: surface(triple[][][]) or surface(patch[][]).
      // Each inner 4x4 triple grid is a bicubic Bezier patch.
      const firstArr = pos.find(a => Array.isArray(a));
      if (firstArr && Array.isArray(firstArr[0]) && Array.isArray(firstArr[0][0]) && isTriple(firstArr[0][0][0])) {
        const faces = [];
        const N = 6;  // tessellation per patch edge
        const B = (t) => {
          const u = 1 - t;
          return [u*u*u, 3*u*u*t, 3*u*t*t, t*t*t];
        };
        for (const patch of firstArr) {
          if (!patch || patch.length < 4) continue;
          const grid = [];
          for (let i = 0; i <= N; i++) {
            const row = [];
            const bu = B(i / N);
            for (let j = 0; j <= N; j++) {
              const bv = B(j / N);
              let x = 0, y = 0, z = 0;
              for (let a = 0; a < 4; a++) {
                for (let b = 0; b < 4; b++) {
                  const p = patch[a] && patch[a][b];
                  if (!p) continue;
                  const w = bu[a] * bv[b];
                  x += w * (p.x || 0);
                  y += w * (p.y || 0);
                  z += w * (p.z || 0);
                }
              }
              row.push(makeTriple(x, y, z));
            }
            grid.push(row);
          }
          for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
              const v00 = grid[i][j], v10 = grid[i+1][j];
              const v11 = grid[i+1][j+1], v01 = grid[i][j+1];
              const f = {vertices: [v00, v10, v11, v01]};
              f.normal = faceNormal(f);
              faces.push(f);
            }
          }
        }
        if (faces.length > 0) return {_tag:'surface', mesh: makeMesh(faces)};
      }
      // path3[] (+ planar=true) — annulus / filled region between boundary loops.
      // When given 1 loop: fan-triangulate its interior. When given 2 loops
      // (outer + inner hole, possibly one reversed): connect matched samples.
      //
      // Accepts either a genuine path array, OR a single path with disjoint
      // subpaths (produced by `a ^^ b` in Asymptote, which our interpreter
      // currently stores as one path whose segment list contains p3→p0 jumps).
      {
        let pathArr = pos.find(a => Array.isArray(a) && a.length > 0 && a.every(x => isPath(x)));
        if (!pathArr) {
          const singlePath = pos.find(a => isPath(a) && a.segs && a.segs.length > 0);
          if (singlePath) {
            // Detect subpaths by scanning for discontinuities between consecutive segs.
            const segs = singlePath.segs;
            const chunks = [];
            let cur = [segs[0]];
            for (let k = 1; k < segs.length; k++) {
              const prev = segs[k-1], now = segs[k];
              const gap = Math.abs((prev.p3.x||0) - (now.p0.x||0)) +
                          Math.abs((prev.p3.y||0) - (now.p0.y||0)) +
                          Math.abs((prev.p3.z||0) - (now.p0.z||0));
              if (gap > 1e-6) { chunks.push(cur); cur = [now]; }
              else cur.push(now);
            }
            chunks.push(cur);
            if (chunks.length >= 2) {
              pathArr = chunks.map(segArr => makePath(segArr, true));
            }
          }
        }
        if (pathArr) {
          const sampleLoop = (pth) => {
            const segs = pth.segs || [];
            const SUB = 12;
            const out = [];
            const toT = (p) => isTriple(p) ? p : (isPair(p) ? makeTriple(p.x, p.y, 0) : makeTriple(p.x||0, p.y||0, p.z||0));
            if (segs.length === 0) return out;
            const isLin = (s) => {
              const ax = s.p3.x - s.p0.x, ay = s.p3.y - s.p0.y, az = (s.p3.z||0) - (s.p0.z||0);
              const d1x = s.cp1.x - s.p0.x, d1y = s.cp1.y - s.p0.y, d1z = (s.cp1.z||0) - (s.p0.z||0);
              return (Math.abs(d1x - ax/3) < 1e-9 && Math.abs(d1y - ay/3) < 1e-9 && Math.abs(d1z - az/3) < 1e-9);
            };
            out.push(toT(segs[0].p0));
            for (const s of segs) {
              if (isLin(s)) out.push(toT(s.p3));
              else {
                const p0=toT(s.p0), c1=toT(s.cp1), c2=toT(s.cp2), p3=toT(s.p3);
                for (let k=1; k<=SUB; k++) {
                  const t=k/SUB, b=1-t;
                  out.push(makeTriple(
                    b*b*b*p0.x + 3*b*b*t*c1.x + 3*b*t*t*c2.x + t*t*t*p3.x,
                    b*b*b*p0.y + 3*b*b*t*c1.y + 3*b*t*t*c2.y + t*t*t*p3.y,
                    b*b*b*p0.z + 3*b*b*t*c1.z + 3*b*t*t*c2.z + t*t*t*p3.z
                  ));
                }
              }
            }
            if (pth.closed && out.length > 1) {
              const a = out[0], b = out[out.length-1];
              if (a.x === b.x && a.y === b.y && a.z === b.z) out.pop();
            }
            return out;
          };
          const loops = pathArr.map(sampleLoop).filter(L => L.length >= 3);
          if (loops.length === 1) {
            const L = loops[0];
            const faces = [];
            for (let i = 1; i < L.length - 1; i++) {
              const f = {vertices: [L[0], L[i], L[i+1]]};
              f.normal = faceNormal(f);
              faces.push(f);
            }
            if (faces.length > 0) return {_tag:'surface', mesh: makeMesh(faces)};
          } else if (loops.length === 2) {
            // Two loops: outer + inner hole. Resample to same count, align
            // phase (nearest starting index), and unify orientation so ring
            // samples match up to produce thin annular quads.
            const resample = (L, n) => {
              // Estimate arc-length-parameterized resample
              const cum = [0];
              for (let i = 1; i < L.length; i++) {
                const a = L[i-1], b = L[i];
                cum.push(cum[i-1] + Math.sqrt((b.x-a.x)**2 + (b.y-a.y)**2 + (b.z-a.z)**2));
              }
              // Close the loop
              const last = L[L.length-1], first = L[0];
              const total = cum[cum.length-1] + Math.sqrt((first.x-last.x)**2 + (first.y-last.y)**2 + (first.z-last.z)**2);
              const out = [];
              for (let k = 0; k < n; k++) {
                const s = (k / n) * total;
                // Find segment that contains arc-length s
                let j = 0;
                while (j < cum.length - 1 && cum[j+1] < s) j++;
                let segLen;
                if (j < cum.length - 1) segLen = cum[j+1] - cum[j];
                else segLen = total - cum[j];
                const t = segLen > 0 ? (s - cum[j]) / segLen : 0;
                const a = L[j];
                const b = (j < L.length - 1) ? L[j+1] : L[0];
                out.push(makeTriple(a.x + (b.x-a.x)*t, a.y + (b.y-a.y)*t, a.z + (b.z-a.z)*t));
              }
              return out;
            };
            const centroid = (L) => {
              let cx=0, cy=0, cz=0;
              for (const p of L) { cx += p.x; cy += p.y; cz += p.z; }
              return makeTriple(cx/L.length, cy/L.length, cz/L.length);
            };
            // Loop signed area on best-fit plane via Newell's normal
            const newellNormal = (L) => {
              let nx=0, ny=0, nz=0;
              for (let i=0; i<L.length; i++) {
                const c = L[i], n = L[(i+1) % L.length];
                nx += (c.y - n.y) * (c.z + n.z);
                ny += (c.z - n.z) * (c.x + n.x);
                nz += (c.x - n.x) * (c.y + n.y);
              }
              return [nx, ny, nz];
            };
            const N = Math.max(loops[0].length, loops[1].length, 32);
            let L0 = resample(loops[0], N);
            let L1 = resample(loops[1], N);
            // Unify orientation: if L0 and L1 normals point opposite ways,
            // reverse L1 so both traverse the same angular direction.
            const n0 = newellNormal(L0), n1 = newellNormal(L1);
            if (n0[0]*n1[0] + n0[1]*n1[1] + n0[2]*n1[2] < 0) {
              L1 = L1.slice().reverse();
            }
            // Phase-align: rotate L1 so L1[k] minimizes distance to L0[k]
            {
              let bestShift = 0, bestSum = Infinity;
              for (let s = 0; s < N; s++) {
                let sum = 0;
                for (let k = 0; k < N; k++) {
                  const a = L0[k], b = L1[(k + s) % N];
                  sum += (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2;
                }
                if (sum < bestSum) { bestSum = sum; bestShift = s; }
              }
              if (bestShift !== 0) {
                L1 = L1.slice(bestShift).concat(L1.slice(0, bestShift));
              }
            }
            const faces = [];
            for (let k = 0; k < N; k++) {
              const k1 = (k + 1) % N;
              const f = {vertices: [L0[k], L0[k1], L1[k1], L1[k]]};
              f.normal = faceNormal(f);
              faces.push(f);
            }
            if (faces.length > 0) return {_tag:'surface', mesh: makeMesh(faces)};
          }
        }
      }
      // Parametric: surface(f, lo, hi, nu[, nv], ...)
      // where f is callable pair→triple
      if (pos.length >= 4 &&
          (typeof pos[0] === 'function' || (pos[0] && (pos[0]._tag === 'func' || pos[0]._tag === 'overload'))) &&
          isPair(pos[1]) && isPair(pos[2])) {
        const f = pos[0];
        const lo = pos[1], hi = pos[2];
        const nu = Math.max(2, Math.floor(toNumber(pos[3])));
        // nv may be absent (defaults to nu) or present as 5th numeric arg
        const nv = (pos.length >= 5 && typeof pos[4] === 'number')
                   ? Math.max(2, Math.floor(toNumber(pos[4]))) : nu;
        const call = (u, v) => {
          const p = makePair(u, v);
          if (typeof f === 'function') return f(p);
          if (f && (f._tag === 'func' || f._tag === 'overload')) return callUserFuncValues(f, [p]);
          return makeTriple(0, 0, 0);
        };
        const grid = [];
        for (let i = 0; i <= nu; i++) {
          const row = [];
          const u = lo.x + (hi.x - lo.x) * i / nu;
          for (let j = 0; j <= nv; j++) {
            const v = lo.y + (hi.y - lo.y) * j / nv;
            const q = call(u, v);
            if (isTriple(q)) row.push(q);
            else if (typeof q === 'number') {
              // surface(real f(pair), lo, hi, n) — height-field overload
              row.push(makeTriple(u, v, q));
            } else {
              row.push(makeTriple(0, 0, 0));
            }
          }
          grid.push(row);
        }
        const faces = [];
        for (let i = 0; i < nu; i++) {
          for (let j = 0; j < nv; j++) {
            const v00 = grid[i][j], v10 = grid[i+1][j];
            const v11 = grid[i+1][j+1], v01 = grid[i][j+1];
            const face = {vertices: [v00, v10, v11, v01], _gi: i, _gj: j};
            face.normal = faceNormal(face);
            faces.push(face);
          }
        }
        const mesh = makeMesh(faces);
        return {_tag:'surface', mesh, _grid: grid, _gridRows: nu+1, _gridCols: nv+1, _gridCyclic: false};
      }
      // surface(revolution)
      const firstRev = args.find(a => a && a._tag === 'revolution');
      if (firstRev && firstRev.mesh) return {_tag:'surface', mesh: firstRev.mesh};
      // surface(surface s, transform3 t, ...) — combine surfaces under transforms
      const firstSurf = args.find(a => a && a._tag === 'surface');
      if (firstSurf) {
        const faces = [];
        for (const a of args) {
          if (a && a._tag === 'surface' && a.mesh) faces.push(...a.mesh.faces);
        }
        if (faces.length > 0) {
          const mesh = makeMesh(faces.map(f => {
            const nf = {vertices: f.vertices.slice()};
            nf.normal = f.normal || faceNormal(nf);
            if (f.pen) nf.pen = f.pen;
            return nf;
          }));
          return {_tag:'surface', mesh};
        }
      }
      const firstPath = args.find(a => isPath(a));
      const firstMesh = args.find(a => isMesh(a));
      if (firstMesh) return {_tag:'surface', mesh: firstMesh};
      if (firstPath) {
        // If the path has triple vertices, fan-triangulate into a mesh
        const segs = firstPath.segs || [];
        const verts = [];
        for (const s of segs) {
          if (s.p0 && isTriple(s.p0)) verts.push(s.p0);
        }
        if (segs.length > 0) {
          const last = segs[segs.length-1].p3;
          if (last && isTriple(last) && (verts.length === 0 || last !== verts[0])) verts.push(last);
        }
        // Dedupe consecutive duplicates (cycle close)
        const dedup = [];
        for (const v of verts) {
          const last = dedup[dedup.length-1];
          if (!last || last.x !== v.x || last.y !== v.y || last.z !== v.z) dedup.push(v);
        }
        if (dedup.length >= 3) {
          const faces = [];
          for (let i = 1; i < dedup.length - 1; i++) {
            const face = {vertices: [dedup[0], dedup[i], dedup[i+1]]};
            face.normal = faceNormal(face);
            faces.push(face);
          }
          return {_tag:'surface', mesh: makeMesh(faces)};
        }
        return {_tag:'surface', boundary: firstPath};
      }
      return {_tag:'surface'};
    });
    env.set('revolution', (...args) => {
      // revolution(path3 p, triple axis=Z[, int n=32, real angle1=0, real angle2=360])
      const pos = args.filter(a => !(a && a._named));
      const named = {};
      for (const a of args) if (a && a._named) Object.assign(named, a);
      const path = pos.find(a => isPath(a));
      let axis = named.axis && isTriple(named.axis) ? named.axis : makeTriple(0,0,1);
      const nLon = named.n !== undefined ? Math.max(3, Math.floor(toNumber(named.n))) : 32;
      const ang1 = named.angle1 !== undefined ? toNumber(named.angle1) : 0;
      const ang2 = named.angle2 !== undefined ? toNumber(named.angle2) : 360;
      // Collect path vertices as triples
      const verts = [];
      if (path && path.segs) {
        for (const s of path.segs) if (s.p0 && isTriple(s.p0)) verts.push(s.p0);
        const last = path.segs[path.segs.length-1];
        if (last && last.p3 && isTriple(last.p3)) verts.push(last.p3);
      }
      if (verts.length < 2) return {_tag:'revolution', mesh: makeMesh([])};
      // Normalize axis
      const aLen = Math.sqrt(axis.x*axis.x + axis.y*axis.y + axis.z*axis.z) || 1;
      const A = makeTriple(axis.x/aLen, axis.y/aLen, axis.z/aLen);
      // For each vertex: closest point on axis through origin = (A·v) A
      // Rodrigues rotation around axis A by angle θ:
      //   v' = v*cosθ + (A×v)*sinθ + A*(A·v)*(1-cosθ)
      const rotated = [];
      for (let j = 0; j <= nLon; j++) {
        const th = (ang1 + (ang2 - ang1) * j / nLon) * Math.PI / 180;
        const c = Math.cos(th), s = Math.sin(th);
        const row = [];
        for (const v of verts) {
          const dot = A.x*v.x + A.y*v.y + A.z*v.z;
          const cx = A.y*v.z - A.z*v.y;
          const cy = A.z*v.x - A.x*v.z;
          const cz = A.x*v.y - A.y*v.x;
          row.push(makeTriple(
            v.x*c + cx*s + A.x*dot*(1-c),
            v.y*c + cy*s + A.y*dot*(1-c),
            v.z*c + cz*s + A.z*dot*(1-c)
          ));
        }
        rotated.push(row);
      }
      const faces = [];
      for (let j = 0; j < nLon; j++) {
        for (let i = 0; i < verts.length - 1; i++) {
          const v00 = rotated[j][i], v10 = rotated[j+1][i];
          const v11 = rotated[j+1][i+1], v01 = rotated[j][i+1];
          const face = {vertices: [v00, v10, v11, v01]};
          face.normal = faceNormal(face);
          faces.push(face);
        }
      }
      return {_tag:'revolution', mesh: makeMesh(faces), path: path, axis: A, _grid: rotated};
    });
    // randompath3(n): small random walk in 3D, returns path3
    env.set('randompath3', (...args) => {
      const n = args.length > 0 && typeof args[0] === 'number' ? Math.max(2, Math.floor(args[0])) : 100;
      // Use a deterministic seed-free simple PRNG so output is reproducible
      let seed = 1234567;
      const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) - 0.5; };
      let x = 0, y = 0, z = 0;
      const pts = [makeTriple(0,0,0)];
      for (let i = 0; i < n; i++) {
        x += rand(); y += rand(); z += rand();
        pts.push(makeTriple(x, y, z));
      }
      const segs = [];
      for (let i = 0; i < pts.length-1; i++) segs.push(lineSegment(pts[i], pts[i+1]));
      return makePath(segs, false);
    });
    // tube(path3 p, real r): stub returning {s: surface around path, center: path}
    env.set('tube', (...args) => {
      const p = args.find(a => isPath(a));
      if (!p) return {_tag:'tube', s: {_tag:'surface', mesh: makeMesh([])}, center: makePath([], false)};
      // Build a thin tubular mesh: sample path, at each sample make a small circular ring
      const r = args.find(a => typeof a === 'number') || 0.1;
      const samples = [];
      if (p.segs) {
        for (const s of p.segs) if (s.p0 && isTriple(s.p0)) samples.push(s.p0);
        const lastSeg = p.segs[p.segs.length-1];
        if (lastSeg && lastSeg.p3 && isTriple(lastSeg.p3)) samples.push(lastSeg.p3);
      }
      if (samples.length < 2) return {_tag:'tube', s: {_tag:'surface', mesh: makeMesh([])}, center: p};
      const nSides = 24;
      const ringAt = (p0, tangent) => {
        // Build two orthonormal vectors perpendicular to tangent
        let u = Math.abs(tangent.z) < 0.9 ? makeTriple(0,0,1) : makeTriple(1,0,0);
        // Gram-Schmidt
        const t = tangent;
        const dot = u.x*t.x + u.y*t.y + u.z*t.z;
        u = makeTriple(u.x - dot*t.x, u.y - dot*t.y, u.z - dot*t.z);
        const ul = Math.sqrt(u.x*u.x+u.y*u.y+u.z*u.z) || 1;
        u = makeTriple(u.x/ul, u.y/ul, u.z/ul);
        const v = makeTriple(
          t.y*u.z - t.z*u.y,
          t.z*u.x - t.x*u.z,
          t.x*u.y - t.y*u.x
        );
        const ring = [];
        for (let k = 0; k < nSides; k++) {
          const a = 2*Math.PI*k/nSides;
          const ca = Math.cos(a), sa = Math.sin(a);
          ring.push(makeTriple(
            p0.x + r*(ca*u.x + sa*v.x),
            p0.y + r*(ca*u.y + sa*v.y),
            p0.z + r*(ca*u.z + sa*v.z)
          ));
        }
        return ring;
      };
      const rings = [];
      for (let i = 0; i < samples.length; i++) {
        const prev = i > 0 ? samples[i-1] : samples[i];
        const next = i < samples.length-1 ? samples[i+1] : samples[i];
        const tx = next.x - prev.x, ty = next.y - prev.y, tz = next.z - prev.z;
        const tl = Math.sqrt(tx*tx+ty*ty+tz*tz) || 1;
        rings.push(ringAt(samples[i], makeTriple(tx/tl, ty/tl, tz/tl)));
      }
      const faces = [];
      for (let i = 0; i < rings.length-1; i++) {
        for (let k = 0; k < nSides; k++) {
          const k1 = (k+1) % nSides;
          const face = {vertices: [rings[i][k], rings[i+1][k], rings[i+1][k1], rings[i][k1]], _gi: i, _gj: k};
          face.normal = faceNormal(face);
          faces.push(face);
        }
      }
      const mesh = makeMesh(faces);
      mesh._closed = true; // closed tube: back-face culling eliminates hidden faces
      const grid = rings;
      return {_tag:'tube', s: {_tag:'surface', mesh, _grid: grid, _gridRows: rings.length, _gridCols: nSides, _gridCyclic: true}, center: p};
    });
    env.set('sphere', (...args) => {
      if (args.length >= 1 && isTriple(args[0])) {
        const c = args[0];
        const r = args.length >= 2 ? toNumber(args[1]) : 1;
        // Build a tessellated sphere mesh centered at c with radius r
        const mesh = _buildSphereMesh(24, 12);
        const scaled = applyTransform3Mesh(scaleT3(r, r, r), mesh);
        return applyTransform3Mesh(shiftT3(c.x, c.y, c.z), scaled);
      }
      // sphere(real r): solids-module revolution-typed sphere at origin
      if (args.length >= 1 && typeof args[0] === 'number') {
        const r = toNumber(args[0]);
        const mesh = applyTransform3Mesh(scaleT3(r, r, r), _buildSphereMesh(24, 12));
        return {_tag:'revolution', mesh};
      }
      return {_tag: 'surface'};
    });
    // Primitive meshes (higher resolution for smoother shading)
    env.set('unitsphere', _buildSphereMesh(48, 24));
    env.set('unitdisk', _buildDiskMesh(48));
    env.set('unitplane', _buildSquareMesh());
    env.set('unitsquare3', _buildSquareMesh());
    env.set('unitcube', _buildCubeMesh());
    env.set('unitcylinder', _buildCylinderMesh(48));
    env.set('unitcone', _buildConeMesh(48));
    // extrude(path[]|path|string, triple axis = 2Z) — prism-extrude a 2D profile
    // along axis. For string input we use texpath (no-op here), so we fall back
    // to a tiny billboard rectangle so the render isn't empty. For path/path[]
    // we build two copies offset by axis and stitch side quads.
    env.set('extrude', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      let profile = pos[0];
      let axis = makeTriple(0, 0, 1);
      if (pos.length >= 2 && isTriple(pos[1])) axis = pos[1];
      // string profile → render a flat billboard rectangle as placeholder
      if (typeof profile === 'string') {
        const w = Math.max(1, profile.length * 0.15);
        const h = 0.6;
        const faces = [];
        const p00 = makeTriple(-w/2, -h/2, 0);
        const p10 = makeTriple(w/2, -h/2, 0);
        const p11 = makeTriple(w/2, h/2, 0);
        const p01 = makeTriple(-w/2, h/2, 0);
        const p002 = makeTriple(-w/2 + axis.x, -h/2 + axis.y, axis.z);
        const p102 = makeTriple(w/2 + axis.x, -h/2 + axis.y, axis.z);
        const p112 = makeTriple(w/2 + axis.x, h/2 + axis.y, axis.z);
        const p012 = makeTriple(-w/2 + axis.x, h/2 + axis.y, axis.z);
        const mk = (a,b,c) => { const f = {vertices:[a,b,c]}; f.normal = faceNormal(f); return f; };
        faces.push(mk(p00,p10,p11), mk(p00,p11,p01));
        faces.push(mk(p002,p112,p102), mk(p002,p012,p112));
        faces.push(mk(p00,p002,p102), mk(p00,p102,p10));
        faces.push(mk(p10,p102,p112), mk(p10,p112,p11));
        faces.push(mk(p11,p112,p012), mk(p11,p012,p01));
        faces.push(mk(p01,p012,p002), mk(p01,p002,p00));
        return {_tag:'surface', mesh: makeMesh(faces)};
      }
      // path or path[] profile
      const paths = Array.isArray(profile) ? profile.filter(p => p && p._tag === 'path') : (profile && profile._tag === 'path' ? [profile] : []);
      if (paths.length === 0) return {_tag:'surface', mesh: makeMesh([])};
      const faces = [];
      for (const pth of paths) {
        // Sample path, including curve subdivisions
        const segs = pth.segs || [];
        if (segs.length === 0) continue;
        const pts = [];
        const SUB = 12; // samples per Bezier segment
        const isLinear = (s) => {
          // control points colinear with endpoints ⇒ straight segment
          const ax = s.p3.x - s.p0.x, ay = s.p3.y - s.p0.y;
          const az = (s.p3.z||0) - (s.p0.z||0);
          const d1x = s.cp1.x - s.p0.x, d1y = s.cp1.y - s.p0.y;
          const d1z = (s.cp1.z||0) - (s.p0.z||0);
          // Fast check: if both control points are equal to the endpoints we have a pure line
          return (Math.abs(d1x - ax/3) < 1e-9 && Math.abs(d1y - ay/3) < 1e-9 && Math.abs(d1z - az/3) < 1e-9);
        };
        const toT = (p) => {
          if (isTriple(p)) return p;
          if (isPair(p)) return makeTriple(p.x, p.y, 0);
          return makeTriple(p.x||0, p.y||0, p.z||0);
        };
        pts.push(toT(segs[0].p0));
        for (const s of segs) {
          if (isLinear(s)) {
            pts.push(toT(s.p3));
          } else {
            const p0 = toT(s.p0), c1 = toT(s.cp1), c2 = toT(s.cp2), p3 = toT(s.p3);
            for (let k = 1; k <= SUB; k++) {
              const t = k / SUB;
              const b = 1 - t;
              const x = b*b*b*p0.x + 3*b*b*t*c1.x + 3*b*t*t*c2.x + t*t*t*p3.x;
              const y = b*b*b*p0.y + 3*b*b*t*c1.y + 3*b*t*t*c2.y + t*t*t*p3.y;
              const z = b*b*b*p0.z + 3*b*b*t*c1.z + 3*b*t*t*c2.z + t*t*t*p3.z;
              pts.push(makeTriple(x, y, z));
            }
          }
        }
        const tLow = pts;
        const tHigh = tLow.map(p => makeTriple(p.x + axis.x, p.y + axis.y, p.z + axis.z));
        // Side quads
        const mk = (a,b,c) => { const f = {vertices:[a,b,c]}; f.normal = faceNormal(f); return f; };
        for (let i = 0; i < tLow.length - 1; i++) {
          faces.push(mk(tLow[i], tLow[i+1], tHigh[i+1]));
          faces.push(mk(tLow[i], tHigh[i+1], tHigh[i]));
        }
        // Fan triangulate caps (approximate if not planar)
        for (let i = 1; i < tLow.length - 1; i++) {
          faces.push(mk(tLow[0], tLow[i], tLow[i+1]));
          faces.push(mk(tHigh[0], tHigh[i+1], tHigh[i]));
        }
      }
      return {_tag:'surface', mesh: makeMesh(faces)};
    });
    // obj(filename[, pen]) — load Wavefront .obj mesh; browser can't read files
    // so return an empty surface. Callers like draw(obj(...)) will produce empty.
    env.set('obj', (...args) => ({_tag:'surface', mesh: makeMesh([])}));
    // labelpath(string, path[, ...]) — draw text along a path. Stub: ignore.
    env.set('labelpath', (...args) => null);
    // contour3 / smoothcontour3 / implicitsurface — isosurface extraction via
    // marching tetrahedra. Each grid cell is split into 6 tetrahedra; for each
    // tet we emit 0–2 triangles on the iso=0 surface with linear edge
    // interpolation. Vertices along shared cube edges are deduplicated so that
    // sf.map(fn) / sf.colors(palette(...)) can assign per-vertex colors.
    //
    // Returns {tris, vertices, faceIdx} where tris is triple[][] (each [v0,v1,v2]),
    // vertices is the deduplicated vertex list, and faceIdx[i] = [i0,i1,i2] is
    // the index triple into vertices for triangle i.
    function _marchTet(f, lo, hi, nx, ny, nz) {
      const tris = [];
      const vertices = [];
      const faceIdx = [];
      if (!isTriple(lo) || !isTriple(hi)) return { tris, vertices, faceIdx };
      nx = Math.max(2, Math.floor(nx || 16));
      ny = Math.max(2, Math.floor(ny || nx));
      nz = Math.max(2, Math.floor(nz || nx));
      const dx = (hi.x - lo.x) / nx;
      const dy = (hi.y - lo.y) / ny;
      const dz = (hi.z - lo.z) / nz;
      const nX = nx + 1, nY = ny + 1, nZ = nz + 1;
      const buf = new Float64Array(nX * nY * nZ);
      const gidx = (i, j, k) => (i * nY + j) * nZ + k;
      const callF = (a, b, c) => {
        let v;
        if (typeof f === 'function') v = f(a, b, c);
        else if (f && (f._tag === 'func' || f._tag === 'overload')) v = callUserFuncValues(f, [a, b, c]);
        else v = 0;
        v = Number(v);
        return isFinite(v) ? v : 0;
      };
      // Evaluate function on grid
      for (let i = 0; i < nX; i++) {
        const x = lo.x + i * dx;
        for (let j = 0; j < nY; j++) {
          const y = lo.y + j * dy;
          for (let k = 0; k < nZ; k++) {
            const z = lo.z + k * dz;
            buf[gidx(i, j, k)] = callF(x, y, z);
          }
        }
      }
      // Cube corner offsets (i, j, k)
      const CORNER = [
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
        [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
      ];
      // 6-tetrahedra decomposition (each inner array: 4 cube-corner indices)
      const TETS = [
        [0, 5, 1, 7],
        [0, 1, 3, 7],
        [0, 3, 2, 7],
        [0, 2, 6, 7],
        [0, 6, 4, 7],
        [0, 4, 5, 7],
      ];
      // Edge vertex cache so that the same cube edge produces the same vertex
      // index (dedup across tets and across neighbouring cubes).
      const edgeCache = new Map();
      // Each cube-corner is identified by its (i,j,k) in the grid [0..nX-1]x...
      // An edge of a cube connects two of these corners. We key edges by
      // ((i0*nY+j0)*nZ+k0) * scale + ((i1*nY+j1)*nZ+k1), sorted so i0<=i1 etc.
      const scale = nX * nY * nZ;
      const edgeVertex = (ca, cb, vala, valb) => {
        // ca, cb are arrays [i,j,k]
        let [i0, j0, k0] = ca, [i1, j1, k1] = cb, va = vala, vb = valb;
        let ka = gidx(i0, j0, k0), kb = gidx(i1, j1, k1);
        if (kb < ka) {
          [ka, kb] = [kb, ka];
          [va, vb] = [vb, va];
          [i0, j0, k0, i1, j1, k1] = [i1, j1, k1, i0, j0, k0];
        }
        const key = ka * scale + kb;
        const hit = edgeCache.get(key);
        if (hit !== undefined) return hit;
        const denom = vb - va;
        let t = denom !== 0 ? (0 - va) / denom : 0.5;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const x = lo.x + (i0 + t * (i1 - i0)) * dx;
        const y = lo.y + (j0 + t * (j1 - j0)) * dy;
        const z = lo.z + (k0 + t * (k1 - k0)) * dz;
        const idx = vertices.length;
        vertices.push(makeTriple(x, y, z));
        edgeCache.set(key, idx);
        return idx;
      };
      // March tetrahedra
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          for (let k = 0; k < nz; k++) {
            // Gather cube corners: absolute grid coords + values
            const corners = [];
            const vals = [];
            for (const [oi, oj, ok] of CORNER) {
              corners.push([i + oi, j + oj, k + ok]);
              vals.push(buf[gidx(i + oi, j + oj, k + ok)]);
            }
            for (const tet of TETS) {
              // Tet vertex values
              const tv = [vals[tet[0]], vals[tet[1]], vals[tet[2]], vals[tet[3]]];
              // Sort vertices: put "below iso" first. Keep permutation to preserve orientation.
              // Use an easier approach: just determine mask and lookup triangles.
              let mask = 0;
              for (let m = 0; m < 4; m++) if (tv[m] < 0) mask |= (1 << m);
              if (mask === 0 || mask === 0xF) continue;
              const tc = [corners[tet[0]], corners[tet[1]], corners[tet[2]], corners[tet[3]]];
              // Edge helper: interpolate between tet vertex a and b
              const ev = (a, b) => edgeVertex(tc[a], tc[b], tv[a], tv[b]);
              // Lookup triangles by mask. Winding chosen so triangles are
              // consistently oriented (normal points from inside to outside,
              // i.e. from below-iso toward above-iso).
              let triList = null;
              switch (mask) {
                case 0x1: triList = [[ev(0,1), ev(0,2), ev(0,3)]]; break;
                case 0xE: triList = [[ev(0,1), ev(0,3), ev(0,2)]]; break;
                case 0x2: triList = [[ev(0,1), ev(1,3), ev(1,2)]]; break;
                case 0xD: triList = [[ev(0,1), ev(1,2), ev(1,3)]]; break;
                case 0x4: triList = [[ev(0,2), ev(1,2), ev(2,3)]]; break;
                case 0xB: triList = [[ev(0,2), ev(2,3), ev(1,2)]]; break;
                case 0x8: triList = [[ev(0,3), ev(2,3), ev(1,3)]]; break;
                case 0x7: triList = [[ev(0,3), ev(1,3), ev(2,3)]]; break;
                // Two vertices below: quad → two triangles
                case 0x3: { const a = ev(0,2), b = ev(0,3), c = ev(1,3), d = ev(1,2); triList = [[a,b,c],[a,c,d]]; break; }
                case 0xC: { const a = ev(0,2), b = ev(1,2), c = ev(1,3), d = ev(0,3); triList = [[a,b,c],[a,c,d]]; break; }
                case 0x5: { const a = ev(0,1), b = ev(0,3), c = ev(2,3), d = ev(1,2); triList = [[a,b,c],[a,c,d]]; break; }
                case 0xA: { const a = ev(0,1), b = ev(1,2), c = ev(2,3), d = ev(0,3); triList = [[a,b,c],[a,c,d]]; break; }
                case 0x6: { const a = ev(0,1), b = ev(0,2), c = ev(2,3), d = ev(1,3); triList = [[a,b,c],[a,c,d]]; break; }
                case 0x9: { const a = ev(0,1), b = ev(1,3), c = ev(2,3), d = ev(0,2); triList = [[a,b,c],[a,c,d]]; break; }
              }
              if (!triList) continue;
              for (const [ia, ib, ic] of triList) {
                tris.push([vertices[ia], vertices[ib], vertices[ic]]);
                faceIdx.push([ia, ib, ic]);
              }
            }
          }
        }
      }
      return { tris, vertices, faceIdx };
    }
    function _isoFaces(f, lo, hi, nx, ny, nz) {
      const faces = [];
      if (!isTriple(lo) || !isTriple(hi)) return faces;
      nx = Math.max(2, Math.floor(nx || 20));
      ny = Math.max(2, Math.floor(ny || nx));
      nz = Math.max(2, Math.floor(nz || nx));
      const dx = (hi.x - lo.x) / nx;
      const dy = (hi.y - lo.y) / ny;
      const dz = (hi.z - lo.z) / nz;
      const nX = nx + 1, nY = ny + 1, nZ = nz + 1;
      const buf = new Float64Array(nX * nY * nZ);
      const gidx = (i,j,k) => (i * nY + j) * nZ + k;
      const callF = (a,b,c) => {
        let v;
        if (typeof f === 'function') v = f(a, b, c);
        else if (f && (f._tag === 'func' || f._tag === 'overload')) v = callUserFuncValues(f, [a, b, c]);
        else v = 0;
        v = Number(v);
        return isFinite(v) ? v : 0;
      };
      for (let i = 0; i < nX; i++) {
        const x = lo.x + i * dx;
        for (let j = 0; j < nY; j++) {
          const y = lo.y + j * dy;
          for (let k = 0; k < nZ; k++) {
            const z = lo.z + k * dz;
            buf[gidx(i,j,k)] = callF(x, y, z);
          }
        }
      }
      const qx = 0.5 * dx, qy = 0.5 * dy, qz = 0.5 * dz;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          for (let k = 0; k < nz; k++) {
            const c000 = buf[gidx(i,j,k)];
            const c100 = buf[gidx(i+1,j,k)];
            const c010 = buf[gidx(i,j+1,k)];
            const c110 = buf[gidx(i+1,j+1,k)];
            const c001 = buf[gidx(i,j,k+1)];
            const c101 = buf[gidx(i+1,j,k+1)];
            const c011 = buf[gidx(i,j+1,k+1)];
            const c111 = buf[gidx(i+1,j+1,k+1)];
            let pos = 0, neg = 0;
            const vs = [c000,c100,c010,c110,c001,c101,c011,c111];
            for (const v of vs) { if (v > 0) pos++; else if (v < 0) neg++; }
            if (pos === 0 || neg === 0) continue;
            // Approximate gradient (finite differences)
            const gx = ((c100+c110+c101+c111) - (c000+c010+c001+c011)) * 0.25;
            const gy = ((c010+c110+c011+c111) - (c000+c100+c001+c101)) * 0.25;
            const gz = ((c001+c101+c011+c111) - (c000+c100+c010+c110)) * 0.25;
            let gl = Math.sqrt(gx*gx + gy*gy + gz*gz) || 1;
            const nxv = gx/gl, nyv = gy/gl, nzv = gz/gl;
            // Two tangent vectors in plane perpendicular to normal
            let ax, ay, az;
            if (Math.abs(nxv) > 0.9) { ax = 0; ay = 1; az = 0; }
            else { ax = 1; ay = 0; az = 0; }
            // t1 = a - (a·n)n
            const adotn = ax*nxv + ay*nyv + az*nzv;
            let t1x = ax - adotn*nxv, t1y = ay - adotn*nyv, t1z = az - adotn*nzv;
            let tl = Math.sqrt(t1x*t1x + t1y*t1y + t1z*t1z) || 1;
            t1x/=tl; t1y/=tl; t1z/=tl;
            // t2 = n × t1
            const t2x = nyv*t1z - nzv*t1y;
            const t2y = nzv*t1x - nxv*t1z;
            const t2z = nxv*t1y - nyv*t1x;
            const cx = lo.x + (i+0.5)*dx;
            const cy = lo.y + (j+0.5)*dy;
            const cz = lo.z + (k+0.5)*dz;
            const s = 0.6 * Math.max(qx, qy, qz); // half-size of face quad
            const mk = (u, v) => makeTriple(
              cx + u*s*t1x + v*s*t2x,
              cy + u*s*t1y + v*s*t2y,
              cz + u*s*t1z + v*s*t2z
            );
            const p0 = mk(-1,-1), p1 = mk(1,-1), p2 = mk(1,1), p3 = mk(-1,1);
            const face = { vertices: [p0, p1, p2, p3], normal: makeTriple(nxv, nyv, nzv) };
            faces.push(face);
          }
        }
      }
      return faces;
    }
    function _isoFromArgs(args) {
      // Accept (f, lo, hi[, n]) or (f, lo, hi, nx[, ny, nz]) and named args
      // (a=, b= for bounds; nx/ny/nz for resolution).
      const pos = [];
      const named = {};
      for (const a of args) {
        if (a && typeof a === 'object' && a._named) {
          for (const k of Object.keys(a)) if (k !== '_named') named[k] = a[k];
        } else pos.push(a);
      }
      const f = pos[0];
      let lo = pos[1], hi = pos[2];
      if (named.a !== undefined) lo = named.a;
      if (named.b !== undefined) hi = named.b;
      if (named.min !== undefined) lo = named.min;
      if (named.max !== undefined) hi = named.max;
      let nx = named.nx !== undefined ? toNumber(named.nx) : (typeof pos[3] === 'number' ? pos[3] : 16);
      let ny = named.ny !== undefined ? toNumber(named.ny) : (typeof pos[4] === 'number' ? pos[4] : nx);
      let nz = named.nz !== undefined ? toNumber(named.nz) : (typeof pos[5] === 'number' ? pos[5] : nx);
      return _isoFaces(f, lo, hi, nx, ny, nz);
    }
    function _marchFromArgs(args) {
      const pos = [];
      const named = {};
      for (const a of args) {
        if (a && typeof a === 'object' && a._named) {
          for (const k of Object.keys(a)) if (k !== '_named') named[k] = a[k];
        } else pos.push(a);
      }
      const f = pos[0];
      let lo = pos[1], hi = pos[2];
      if (named.a !== undefined) lo = named.a;
      if (named.b !== undefined) hi = named.b;
      if (named.min !== undefined) lo = named.min;
      if (named.max !== undefined) hi = named.max;
      let nx = named.nx !== undefined ? toNumber(named.nx) : (typeof pos[3] === 'number' ? pos[3] : 16);
      let ny = named.ny !== undefined ? toNumber(named.ny) : (typeof pos[4] === 'number' ? pos[4] : nx);
      let nz = named.nz !== undefined ? toNumber(named.nz) : (typeof pos[5] === 'number' ? pos[5] : nx);
      return _marchTet(f, lo, hi, nx, ny, nz);
    }
    env.set('contour3', (...args) => {
      const { tris, vertices, faceIdx } = _marchFromArgs(args);
      // Attach metadata to the triangle array so surface() can pick it up for
      // per-vertex coloring. JavaScript arrays can carry non-integer props.
      tris._contourVertices = vertices;
      tris._contourFaceIdx = faceIdx;
      return tris;
    });
    env.set('smoothcontour3', (...args) => {
      return env.get('contour3')(...args);
    });
    env.set('implicitsurface', (...args) => {
      const { tris, vertices, faceIdx } = _marchFromArgs(args);
      const faces = [];
      for (let i = 0; i < tris.length; i++) {
        const t = tris[i];
        const face = { vertices: [t[0], t[1], t[2]], _vidx: faceIdx[i] };
        face.normal = faceNormal(face);
        faces.push(face);
      }
      return {
        _tag: 'surface',
        mesh: makeMesh(faces),
        _vertices: vertices,
        _faceVertexIdx: faceIdx,
      };
    });

    // solids-module constructors: return a mesh (painter's-algorithm rendering).
    // cone(center, r, h[, axis]) — axis defaults to Z; only axial cone supported.
    env.set('cone', (...args) => {
      // Build cone as a revolution: generator path from base (r,0,0) to apex (0,0,h),
      // revolved around Z. Returns {_tag:'revolution', mesh, _grid, _gridRows, _gridCols, _gridCyclic}.
      const buildCone = (cx, cy, cz, r, h) => {
        const nLon = 24;
        const grid = []; // grid[j][i] with j ∈ [0..nLon], i ∈ [0..1]
        for (let j = 0; j <= nLon; j++) {
          const ang = (j / nLon) * 2 * Math.PI;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const base = makeTriple(cx + r*ca, cy + r*sa, cz);
          const apex = makeTriple(cx, cy, cz + h);
          grid.push([base, apex]);
        }
        // Lateral mesh: triangles with apex shared
        const faces = [];
        for (let j = 0; j < nLon; j++) {
          const b0 = grid[j][0], b1 = grid[j+1][0], ap = grid[j][1];
          const f = {vertices: [b0, b1, ap], _gi: 0, _gj: j};
          f.normal = faceNormal(f);
          faces.push(f);
        }
        // Base cap: fan from center to base ring (outward face normal -Z if h>0)
        const base0 = makeTriple(cx, cy, cz);
        for (let j = 0; j < nLon; j++) {
          const b0 = grid[j][0], b1 = grid[j+1][0];
          const verts = h > 0 ? [base0, b1, b0] : [base0, b0, b1];
          const f = {vertices: verts};
          f.normal = faceNormal(f);
          faces.push(f);
        }
        return {
          _tag: 'revolution',
          mesh: makeMesh(faces),
          _grid: grid,
          _gridRows: 2,
          _gridCols: nLon + 1,
          _gridCyclic: true,
        };
      };
      if (args.length >= 3 && isTriple(args[0]) && typeof args[1] === 'number' && typeof args[2] === 'number') {
        const c = args[0], r = toNumber(args[1]), h = toNumber(args[2]);
        return buildCone(c.x, c.y, c.z, r, h);
      }
      // cone(r, h) — base at origin
      if (args.length >= 2 && typeof args[0] === 'number' && typeof args[1] === 'number') {
        const r = toNumber(args[0]), h = toNumber(args[1]);
        return buildCone(0, 0, 0, r, h);
      }
      return {_tag: 'revolution', mesh: makeMesh([]), _grid: [], _gridRows: 0, _gridCols: 0, _gridCyclic: true};
    });
    // cylinder(center, r, h[, axis]) — returns a revolution object for proper silhouette rendering
    env.set('cylinder', (...args) => {
      // Parse: cylinder(triple center, real r, real h, triple axis=Z)
      // or: cylinder(real r, real h) with center=O, axis=Z
      let center = makeTriple(0, 0, 0);
      let radius = 1, height = 1;
      let axis = makeTriple(0, 0, 1);
      const pos = args.filter(a => !(a && a._named));
      const named = {};
      for (const a of args) if (a && a._named) Object.assign(named, a);
      if (pos.length >= 3 && isTriple(pos[0]) && typeof pos[1] === 'number' && typeof pos[2] === 'number') {
        center = pos[0];
        radius = toNumber(pos[1]);
        height = toNumber(pos[2]);
        if (pos.length >= 4 && isTriple(pos[3])) axis = pos[3];
      } else if (pos.length >= 2 && typeof pos[0] === 'number' && typeof pos[1] === 'number') {
        radius = toNumber(pos[0]);
        height = toNumber(pos[1]);
        if (pos.length >= 3 && isTriple(pos[2])) axis = pos[2];
      }
      // Build the revolution: generator path is a vertical line from base to top
      // at distance `radius` from the axis, revolved 360° around the axis
      const nLon = 32;
      // Normalize axis
      const aLen = Math.sqrt(axis.x*axis.x + axis.y*axis.y + axis.z*axis.z) || 1;
      const A = makeTriple(axis.x/aLen, axis.y/aLen, axis.z/aLen);
      // Find a perpendicular to the axis for the generator direction
      let perpX, perpY, perpZ;
      if (Math.abs(A.x) < 0.9) {
        // cross(A, (1,0,0))
        perpX = 0; perpY = A.z; perpZ = -A.y;
      } else {
        // cross(A, (0,1,0))
        perpX = -A.z; perpY = 0; perpZ = A.x;
      }
      const perpLen = Math.sqrt(perpX*perpX + perpY*perpY + perpZ*perpZ) || 1;
      perpX /= perpLen; perpY /= perpLen; perpZ /= perpLen;
      // Generator path: two points at bottom and top of cylinder side
      const baseX = center.x + perpX * radius;
      const baseY = center.y + perpY * radius;
      const baseZ = center.z + perpZ * radius;
      const topX = baseX + A.x * height;
      const topY = baseY + A.y * height;
      const topZ = baseZ + A.z * height;
      // Revolve around axis through center
      const rotated = [];
      for (let j = 0; j <= nLon; j++) {
        const th = 2 * Math.PI * j / nLon;
        const c = Math.cos(th), s = Math.sin(th);
        const row = [];
        // Rodrigues rotation around axis A by angle th, about center
        const rotateAboutAxis = (px, py, pz) => {
          // Translate to origin (center-relative)
          const vx = px - center.x, vy = py - center.y, vz = pz - center.z;
          const dot = A.x*vx + A.y*vy + A.z*vz;
          const cx = A.y*vz - A.z*vy;
          const cy = A.z*vx - A.x*vz;
          const cz = A.x*vy - A.y*vx;
          return makeTriple(
            center.x + vx*c + cx*s + A.x*dot*(1-c),
            center.y + vy*c + cy*s + A.y*dot*(1-c),
            center.z + vz*c + cz*s + A.z*dot*(1-c)
          );
        };
        row.push(rotateAboutAxis(baseX, baseY, baseZ));
        row.push(rotateAboutAxis(topX, topY, topZ));
        rotated.push(row);
      }
      // Build faces for the mesh
      const faces = [];
      for (let j = 0; j < nLon; j++) {
        const v00 = rotated[j][0], v10 = rotated[j+1][0];
        const v11 = rotated[j+1][1], v01 = rotated[j][1];
        const face = {vertices: [v00, v10, v11, v01]};
        face.normal = faceNormal(face);
        faces.push(face);
      }
      return {_tag:'revolution', mesh: makeMesh(faces), axis: A, _grid: rotated, _center: center, _radius: radius, _height: height};
    });
    // render() — accepts any args, returns an opaque marker object ignored by draw
    env.set('render', (...args) => ({_tag:'renderOpts'}));
    // Generic 3D picture stubs / module markers
    env.set('Viewport', {_tag:'light'});
    // align(triple unit) — stub: return identity transform3 (proper align pending)
    env.set('align', (...args) => identityT3());
    env.set('unit', (v) => {
      if (isTriple(v)) {
        const L = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z) || 1;
        return makeTriple(v.x/L, v.y/L, v.z/L);
      }
      if (isPair(v)) {
        const L = Math.sqrt(v.x*v.x + v.y*v.y) || 1;
        return makePair(v.x/L, v.y/L);
      }
      return v;
    });

    // palette module: map real values to interpolated pens from a range palette.
    // palette(real[] vals, pen[] range) -> pen[] (one interpolated pen per value)
    const _interpolatePens = (pens, t) => {
      const n = pens.length;
      if (n === 0) return makePen({r:0,g:0,b:0});
      if (n === 1) return clonePen(pens[0]);
      // Clamp t to [0,1]
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const u = t * (n - 1);
      const i0 = Math.floor(u);
      const i1 = Math.min(i0 + 1, n - 1);
      const f = u - i0;
      const p0 = pens[i0], p1 = pens[i1];
      const out = clonePen(p0);
      out.r = (p0.r || 0) * (1 - f) + (p1.r || 0) * f;
      out.g = (p0.g || 0) * (1 - f) + (p1.g || 0) * f;
      out.b = (p0.b || 0) * (1 - f) + (p1.b || 0) * f;
      if (typeof p0.opacity === 'number' && typeof p1.opacity === 'number') {
        out.opacity = p0.opacity * (1 - f) + p1.opacity * f;
      }
      return out;
    };
    const _paletteStub = (...args) => {
      const pos = args.filter(a => !(a && a._named));
      let vals = null, range = null;
      for (const a of pos) {
        if (Array.isArray(a) && a.length > 0) {
          if (typeof a[0] === 'number' && vals === null) vals = a;
          else if (isPen(a[0]) && range === null) range = a;
        }
      }
      if (!range || range.length === 0) return [];
      if (!vals) return range;
      let vmin = Infinity, vmax = -Infinity;
      for (const v of vals) {
        const n = toNumber(v);
        if (n < vmin) vmin = n;
        if (n > vmax) vmax = n;
      }
      const span = vmax - vmin;
      if (span === 0 || !isFinite(span)) {
        return vals.map(() => clonePen(range[0]));
      }
      return vals.map(v => _interpolatePens(range, (toNumber(v) - vmin) / span));
    };
    env.set('palette', _paletteStub);
    // Gradient(pen, pen, ...) — return pen array (used by palette for interpolation)
    env.set('Gradient', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      return pos.filter(a => isPen(a));
    });
    // Rainbow: dense rainbow gradient.
    const rainbowPens = () => {
      const c = (r,g,b) => makePen({r, g, b});
      // Violet → Blue → Cyan → Green → Yellow → Orange → Red (color-wheel order)
      return [
        c(0.5, 0, 1),   // violet
        c(0, 0, 1),     // blue
        c(0, 1, 1),     // cyan
        c(0, 1, 0),     // green
        c(1, 1, 0),     // yellow
        c(1, 0.5, 0),   // orange
        c(1, 0, 0),     // red
      ];
    };
    // BWRainbow: Asymptote's BWRainbow is Rainbow bracketed by darker purple at
    // the low end and darker red at the high end (for visibility of extremes
    // against white backgrounds).
    const bwRainbowPens = () => {
      const c = (r,g,b) => makePen({r, g, b});
      return [
        c(0.25, 0, 0.35),  // dark purple (low)
        c(0.5, 0, 1),      // violet
        c(0, 0, 1),        // blue
        c(0, 1, 1),        // cyan
        c(0, 1, 0),        // green
        c(1, 1, 0),        // yellow
        c(1, 0.5, 0),      // orange
        c(1, 0, 0),        // red
        c(0.35, 0, 0),     // dark red (high)
      ];
    };
    env.set('Rainbow', (...args) => rainbowPens());
    env.set('BWRainbow', (...args) => bwRainbowPens());
    // Wheel(): HSV color wheel palette. Maps degrees (0-360) through the hue spectrum.
    // In Asymptote, Wheel() generates a 1024-entry palette for smooth hue interpolation.
    const wheelPens = () => {
      const pens = [];
      const N = 1024; // Match Asymptote's resolution
      for (let i = 0; i < N; i++) {
        const h = i / N; // hue in [0,1)
        // Convert HSV (h, 1, 1) to RGB
        const hp = h * 6;
        const c = 1, x = 1 - Math.abs(hp % 2 - 1);
        let r, g, b;
        if (hp < 1)      { r = c; g = x; b = 0; }
        else if (hp < 2) { r = x; g = c; b = 0; }
        else if (hp < 3) { r = 0; g = c; b = x; }
        else if (hp < 4) { r = 0; g = x; b = c; }
        else if (hp < 5) { r = x; g = 0; b = c; }
        else             { r = c; g = 0; b = x; }
        pens.push(makePen({r, g, b}));
      }
      return pens;
    };
    env.set('Wheel', (...args) => wheelPens());
    // mean(pen[]) -> average pen
    env.set('mean', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      const arr = Array.isArray(pos[0]) ? pos[0] : pos;
      if (arr.length === 0) return makePen({});
      if (isPen(arr[0])) {
        let r=0, g=0, b=0;
        for (const p of arr) { r += p.r; g += p.g; b += p.b; }
        const n = arr.length;
        return makePen({r:r/n, g:g/n, b:b/n});
      }
      // real[] mean
      let s = 0;
      for (const v of arr) s += toNumber(v);
      return s / arr.length;
    });
    // Named pen constants commonly used by palette examples.
    const mkPen = (r,g,b) => makePen({r, g, b});
    env.set('heavyblue',   mkPen(0.1, 0.1, 0.65));
    env.set('heavyred',    mkPen(0.65, 0.1, 0.1));
    env.set('heavygreen',  mkPen(0.1, 0.5, 0.1));
    env.set('palegreen',   mkPen(0.75, 0.95, 0.75));
    env.set('palered',     mkPen(0.95, 0.75, 0.75));
    env.set('paleblue',    mkPen(0.75, 0.75, 0.95));
    env.set('lightolive',  mkPen(0.75, 0.75, 0.55));
    env.set('paleyellow',  mkPen(1.0, 1.0, 0.75));

    // texpath(label|string) — produces path outline of rasterized TeX output.
    // Approximation: return a single rectangle path whose width/height are crude
    // estimates from the string length, so extrude(texpath(...)) still produces
    // some visible geometry instead of nothing.
    env.set('texpath', (...args) => {
      let s = '';
      for (const a of args) {
        if (typeof a === 'string') { s = a; break; }
        if (a && a._tag === 'Label' && typeof a.text === 'string') { s = a.text; break; }
      }
      if (!s) return [makePath([], false)];
      // Strip common LaTeX math / formatting markers for a rough length
      const core = s.replace(/\$|\\displaystyle|\\text[a-z]*|\\mathrm|\\mathbf|\\hbox|\\emph|\\tt|\\frac|\\sqrt|\\pi|\\alpha|\\infty|\\,|\\\\|[{}_^\\]/g, '');
      const len = Math.max(1, core.length);
      const w = 0.35 * len; // approximate em-width per character
      const h = 1.0;
      const rect = makePath([
        lineSegment(makePair(0, 0), makePair(w, 0)),
        lineSegment(makePair(w, 0), makePair(w, h)),
        lineSegment(makePair(w, h), makePair(0, h)),
        lineSegment(makePair(0, h), makePair(0, 0)),
      ], true);
      return [rect];
    });

    // size3(W,H,D): 3D bounding-box size hint. Currently we record the requested
    // 3D dims on the picture for diagnostics and use max(W,H) as the 2D size if
    // no size() was given. Full 3D aspect-preserving scaling is Phase 1.
    env.set('size3', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      const w = pos.length > 0 ? toNumber(pos[0]) : 0;
      const h = pos.length > 1 ? toNumber(pos[1]) : w;
      const d = pos.length > 2 ? toNumber(pos[2]) : h;
      currentPic._size3W = w;
      currentPic._size3H = h;
      currentPic._size3D = d;
      // Fallback: if no 2D size set yet, use max of W,H,D so diagram isn't tiny.
      if (sizeW === 0 && sizeH === 0) {
        const s = Math.max(w, h, d);
        sizeW = s; sizeH = s;
      }
    });

    // path3 wire-frame type: {_tag:'path3', edges, vertices}
    function makePath3Wire(edges, vertices) {
      return {_tag:'path3', edges, vertices};
    }
    function _boxEdges(a, b) {
      const ax = a.x, ay = a.y, az = a.z;
      const bx = b.x, by = b.y, bz = b.z;
      const v = [
        makeTriple(ax, ay, az), makeTriple(bx, ay, az),
        makeTriple(ax, by, az), makeTriple(bx, by, az),
        makeTriple(ax, ay, bz), makeTriple(bx, ay, bz),
        makeTriple(ax, by, bz), makeTriple(bx, by, bz),
      ];
      const edge = (i, j) => makePath([lineSegment(v[i], v[j])], false);
      const edges = [
        edge(0,1), edge(1,3), edge(3,2), edge(2,0), // bottom face
        edge(4,5), edge(5,7), edge(7,6), edge(6,4), // top face
        edge(0,4), edge(1,5), edge(3,7), edge(2,6), // verticals
      ];
      return makePath3Wire(edges, v);
    }
    env.set('box', (...args) => {
      if (args.length >= 2 && isTriple(args[0]) && isTriple(args[1])) {
        return _boxEdges(args[0], args[1]);
      }
      // 2D fallback: box(a, b) as rectangle path
      if (args.length >= 2 && isPair(args[0]) && isPair(args[1])) {
        const a = args[0], b = args[1];
        return makePath([
          lineSegment(makePair(a.x,a.y), makePair(b.x,a.y)),
          lineSegment(makePair(b.x,a.y), makePair(b.x,b.y)),
          lineSegment(makePair(b.x,b.y), makePair(a.x,b.y)),
          lineSegment(makePair(a.x,b.y), makePair(a.x,a.y)),
        ], true);
      }
      return null;
    });
    env.set('unitbox', _boxEdges(makeTriple(0,0,0), makeTriple(1,1,1)));

    // settings object — properties like settings.render are silently accepted
    env.set('settings', { render: 0, outformat: '', prc: false, tex: 'pdflatex' });

    // light stubs
    env.set('light', (...args) => ({_tag:'light'}));
    // currentlight is a mutable object so .background can be assigned
    const _currentlight = {_tag:'light', background: null};
    env.set('currentlight', _currentlight);
    env.set('nolight', {_tag:'light'});
    env.set('Headlamp', {_tag:'light'});
    env.set('White', {_tag:'light'});

    // material stubs
    env.set('material', (...args) => isPen(args[0]) ? args[0] : makePen({}));
    env.set('emissive', (p) => isPen(p) ? p : makePen({}));

    // 3D axis specifiers
    env.set('Bounds', (...args) => ({_tag:'axis3type', type:'Bounds'}));
    env.set('InTicks', (...args) => {
      const pos = args.filter(a => !(a && a._named));
      const named = {};
      for (const a of args) if (a && a._named) Object.assign(named, a);
      return {
        _tag:'ticks3',
        beginlabel: named.beginlabel !== false,
        endlabel: named.endlabel !== false,
        Label: pos.find(a => a && a._tag === 'Label') || null,
      };
    });
    env.set('OutTicks', (...args) => ({_tag:'ticks3', type:'OutTicks'}));
    env.set('InOutTicks', (...args) => ({_tag:'ticks3', type:'InOutTicks'}));
    env.set('NoTicks3', null);

    // 3D axis functions: draw axis along bounding box edges with ticks and labels
    // Collects axis3 calls and defers drawing to _finalize3DAxes at picture finalization
    const _pendingAxis3Calls = [];
    function _draw3DAxis(axisName, label, axisType, ticks, pen, arrow, pic) {
      // Queue axis for deferred rendering once bounds are known
      _pendingAxis3Calls.push({axisName, label, axisType, ticks, pen, arrow, pic});
    }

    // Helper to compute nice tick values for an axis range
    function _niceTickValues(min, max, targetCount) {
      const range = max - min;
      if (range <= 0) return [min];
      // Find a nice step size
      const rawStep = range / targetCount;
      const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const residual = rawStep / magnitude;
      let niceStep;
      if (residual <= 1.5) niceStep = magnitude;
      else if (residual <= 3) niceStep = 2 * magnitude;
      else if (residual <= 7) niceStep = 5 * magnitude;
      else niceStep = 10 * magnitude;
      // Generate ticks starting from floor of min
      const ticks = [];
      let t = Math.floor(min / niceStep) * niceStep;
      // If first tick is below min, move to next
      if (t < min - niceStep * 0.001) t += niceStep;
      while (t <= max + niceStep * 0.001) {
        ticks.push(Math.round(t / niceStep) * niceStep);
        t += niceStep;
      }
      // Ensure 0 is included if range spans 0 (or starts near 0)
      if (min <= 0.001 && max >= -0.001 && !ticks.includes(0)) {
        ticks.push(0);
        ticks.sort((a, b) => a - b);
      }
      return ticks;
    }

    // Format a tick number for display (remove trailing zeros, avoid -0)
    function _formatTick(v) {
      if (Math.abs(v) < 1e-10) return '0';
      // Check if it's essentially an integer
      if (Math.abs(v - Math.round(v)) < 1e-10) {
        return String(Math.round(v));
      }
      // Otherwise format with reasonable precision
      return v.toFixed(2).replace(/\.?0+$/, '');
    }

    // Finalize all 3D axes once bounds are known (called before picture is returned)
    function _finalize3DAxes(pic) {
      if (_pendingAxis3Calls.length === 0) return;
      // Get bounds from picture or use defaults
      let b = pic._3dBounds;
      if (!b || b.minX === Infinity) {
        // Try to compute bounds from mesh commands
        b = {minX: -Math.PI, maxX: Math.PI, minY: -2, maxY: 2, minZ: 0, maxZ: 4};
        for (const c of pic.commands) {
          if (c.mesh && c.mesh.faces) {
            if (b.minX === -Math.PI) b = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity};
            for (const face of c.mesh.faces) {
              for (const v of face.vertices || []) {
                if (v.x < b.minX) b.minX = v.x; if (v.x > b.maxX) b.maxX = v.x;
                if (v.y < b.minY) b.minY = v.y; if (v.y > b.maxY) b.maxY = v.y;
                if (v.z < b.minZ) b.minZ = v.z; if (v.z > b.maxZ) b.maxZ = v.z;
              }
            }
          }
        }
      }
      if (b.minX === Infinity) {
        b = {minX: -Math.PI, maxX: Math.PI, minY: -2, maxY: 2, minZ: 0, maxZ: 4};
      }

      // Snap bounds to nice round values for axis display (like Asymptote's Bounds)
      // This ensures axes show nice numbers like 0, 1, 2, 3 instead of 0.1, 1.1, etc.
      function snapToNice(val, isMin) {
        const abs = Math.abs(val);
        if (abs < 0.1) return isMin ? 0 : (val > 0 ? 1 : 0);
        const mag = Math.pow(10, Math.floor(Math.log10(abs)));
        if (isMin) {
          return Math.floor(val / mag) * mag;
        } else {
          return Math.ceil(val / mag) * mag;
        }
      }
      // For z-axis, snap minZ down to 0 if it's close
      // Don't artificially extend maxZ - keep it at actual surface max
      if (b.minZ > 0 && b.minZ < 0.5) b.minZ = 0;

      const axisPen = makePen({r:0, g:0, b:0, linewidth: 0.5});
      const tickPen = makePen({r:0, g:0, b:0, linewidth: 0.3});
      const tickLen = 0.05 * Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);

      // Track which axes are requested and check for Bounds type
      const axes = {};
      let hasBoundsAxis = false;
      for (const call of _pendingAxis3Calls) {
        axes[call.axisName] = call;
        if (call.axisType && call.axisType.type === 'Bounds') hasBoundsAxis = true;
      }

      // Draw bounding box edges (only for Bounds-style axes)
      function drawEdge(p0, p1, pen) {
        const proj0 = projectTriple(makeTriple(p0[0], p0[1], p0[2]));
        const proj1 = projectTriple(makeTriple(p1[0], p1[1], p1[2]));
        const seg = makeSeg(proj0, proj0, proj1, proj1);
        const path = makePath([seg], false);
        pic.commands.push({cmd:'draw', path, pen, line: 0});
      }

      // Only draw the full bounding box if at least one axis uses Bounds
      if (hasBoundsAxis) {
        // Draw box edges based on typical Asymptote Bounds style
        // Bottom face (z = minZ)
        drawEdge([b.minX, b.minY, b.minZ], [b.maxX, b.minY, b.minZ], axisPen);
        drawEdge([b.maxX, b.minY, b.minZ], [b.maxX, b.maxY, b.minZ], axisPen);
        drawEdge([b.maxX, b.maxY, b.minZ], [b.minX, b.maxY, b.minZ], axisPen);
        drawEdge([b.minX, b.maxY, b.minZ], [b.minX, b.minY, b.minZ], axisPen);
        // Top face (z = maxZ)
        drawEdge([b.minX, b.minY, b.maxZ], [b.maxX, b.minY, b.maxZ], axisPen);
        drawEdge([b.maxX, b.minY, b.maxZ], [b.maxX, b.maxY, b.maxZ], axisPen);
        drawEdge([b.maxX, b.maxY, b.maxZ], [b.minX, b.maxY, b.maxZ], axisPen);
        drawEdge([b.minX, b.maxY, b.maxZ], [b.minX, b.minY, b.maxZ], axisPen);
        // Vertical edges
        drawEdge([b.minX, b.minY, b.minZ], [b.minX, b.minY, b.maxZ], axisPen);
        drawEdge([b.maxX, b.minY, b.minZ], [b.maxX, b.minY, b.maxZ], axisPen);
        drawEdge([b.maxX, b.maxY, b.minZ], [b.maxX, b.maxY, b.maxZ], axisPen);
        drawEdge([b.minX, b.maxY, b.minZ], [b.minX, b.maxY, b.maxZ], axisPen);
      }

      // Draw tick marks and labels for each axis (only for Bounds-style axes)
      function drawTicks(axisName, call) {
        // Skip ticks for simple axis lines (non-Bounds)
        if (!call.axisType || call.axisType.type !== 'Bounds') return;
        const beginlabel = call.ticks ? call.ticks.beginlabel !== false : true;
        const endlabel = call.ticks ? call.ticks.endlabel !== false : true;

        if (axisName === 'x') {
          // X axis: runs along bottom front edge at y=maxY, z=minZ
          // Ticks point into box (up), labels outside and below the edge
          const ticks = _niceTickValues(b.minX, b.maxX, 6);
          const zRange = b.maxZ - b.minZ;
          const yRange = b.maxY - b.minY;
          // Compute 2D offset for "below" the x-axis edge
          // Project the edge and a point below it to find the direction
          const edgePt = projectTriple(makeTriple(0, b.maxY, b.minZ));
          const belowPt = projectTriple(makeTriple(0, b.maxY, b.minZ - zRange * 0.3));
          const dx = belowPt.x - edgePt.x;
          const dy = belowPt.y - edgePt.y;
          const len = Math.sqrt(dx*dx + dy*dy) || 1;
          const tickLabelOffset = 1.5; // Asymptote units below edge
          const axisLabelOffset = 3.0;

          for (let i = 0; i < ticks.length; i++) {
            const x = ticks[i];
            if (x < b.minX || x > b.maxX) continue;
            // Draw tick mark pointing into box (up in z)
            const tickStart = makeTriple(x, b.maxY, b.minZ);
            const tickEnd = makeTriple(x, b.maxY, b.minZ + zRange * 0.015);
            const projStart = projectTriple(tickStart);
            const projEnd = projectTriple(tickEnd);
            const tickSeg = makeSeg(projStart, projStart, projEnd, projEnd);
            pic.commands.push({cmd:'draw', path: makePath([tickSeg], false), pen: tickPen, line: 0});
            // Draw tick label - project 3D position then offset in 2D "below" direction
            if (!beginlabel && i === 0) continue;
            if (!endlabel && i === ticks.length - 1) continue;
            const basePos = projectTriple(makeTriple(x, b.maxY, b.minZ));
            const labelPos = makePair(basePos.x + dx/len * tickLabelOffset, basePos.y + dy/len * tickLabelOffset);
            pic.commands.push({cmd:'label', text: _formatTick(x), pos: labelPos, align: makePair(0, 1), pen: tickPen, line: 0});
          }
          // Draw axis label centered, below tick labels
          if (call.label) {
            const midX = (b.minX + b.maxX) / 2;
            const basePos = projectTriple(makeTriple(midX, b.maxY, b.minZ));
            const labelPos = makePair(basePos.x + dx/len * axisLabelOffset, basePos.y + dy/len * axisLabelOffset);
            pic.commands.push({cmd:'label', text: call.label, pos: labelPos, align: makePair(0, 1), pen: axisPen, line: 0});
          }
        } else if (axisName === 'y') {
          // Y axis: runs along right edge at x=maxX, z=minZ
          // Ticks point LEFT into box, labels to the right (outside)
          const ticks = _niceTickValues(b.minY, b.maxY, 5);
          const labelOffset = tickLen * 3;
          for (let i = 0; i < ticks.length; i++) {
            const y = ticks[i];
            if (y < b.minY || y > b.maxY) continue;
            // Draw tick mark pointing LEFT into box
            const tickStart = makeTriple(b.maxX, y, b.minZ);
            const tickEnd = makeTriple(b.maxX - tickLen * 0.8, y, b.minZ);
            const projStart = projectTriple(tickStart);
            const projEnd = projectTriple(tickEnd);
            const tickSeg = makeSeg(projStart, projStart, projEnd, projEnd);
            pic.commands.push({cmd:'draw', path: makePath([tickSeg], false), pen: tickPen, line: 0});
            // Draw tick label to the right (outside box)
            if (!beginlabel && i === 0) continue;
            if (!endlabel && i === ticks.length - 1) continue;
            const labelPos = projectTriple(makeTriple(b.maxX + labelOffset * 0.5, y, b.minZ - labelOffset * 0.3));
            pic.commands.push({cmd:'label', text: _formatTick(y), pos: labelPos, align: makePair(-1, 0), pen: tickPen, line: 0});
          }
          // Draw axis label to the right
          if (call.label) {
            const midY = (b.minY + b.maxY) / 2;
            const labelPos = projectTriple(makeTriple(b.maxX + labelOffset * 1.5, midY, b.minZ - labelOffset * 0.8));
            pic.commands.push({cmd:'label', text: call.label, pos: labelPos, align: makePair(-1, 0), pen: axisPen, line: 0});
          }
        } else if (axisName === 'z') {
          // Z axis: runs along left-back vertical edge at x=minX, y=minY
          // Ticks point RIGHT into box, labels to the left (outside)
          const ticks = _niceTickValues(b.minZ, b.maxZ, 5);
          const labelOffset = tickLen * 3;
          for (let i = 0; i < ticks.length; i++) {
            const z = ticks[i];
            if (z < b.minZ || z > b.maxZ) continue;
            // Draw tick mark pointing RIGHT into box
            const tickStart = makeTriple(b.minX, b.minY, z);
            const tickEnd = makeTriple(b.minX + tickLen * 0.8, b.minY, z);
            const projStart = projectTriple(tickStart);
            const projEnd = projectTriple(tickEnd);
            const tickSeg = makeSeg(projStart, projStart, projEnd, projEnd);
            pic.commands.push({cmd:'draw', path: makePath([tickSeg], false), pen: tickPen, line: 0});
            // Draw tick label to the left (outside box)
            const labelPos = projectTriple(makeTriple(b.minX - labelOffset * 0.5, b.minY - labelOffset * 0.3, z));
            pic.commands.push({cmd:'label', text: _formatTick(z), pos: labelPos, align: makePair(1, 0), pen: tickPen, line: 0});
          }
          // Draw axis label to the left
          if (call.label) {
            const midZ = (b.minZ + b.maxZ) / 2;
            const labelPos = projectTriple(makeTriple(b.minX - labelOffset * 1.5, b.minY - labelOffset * 0.8, midZ));
            pic.commands.push({cmd:'label', text: call.label, pos: labelPos, align: makePair(1, 0), pen: axisPen, line: 0});
          }
        }
      }

      // Simple axis lines for non-Bounds axes are not fully supported
      // (would need to handle xmin, xmax, dashed, etc. parameters)
      // For now, skip drawing them to avoid regressions on diagrams like 12825
      function drawSimpleAxis(axisName, call) {
        // Skip - complex parameter handling not implemented
        return;
      }

      // Draw each requested axis
      for (const call of _pendingAxis3Calls) {
        drawTicks(call.axisName, call);
        drawSimpleAxis(call.axisName, call);
      }

      // Clear pending calls
      _pendingAxis3Calls.length = 0;
    }
    // Helper to resolve lazy axis3 specifiers (passed as functions without args)
    // Only resolve specific known axis specifiers, not arbitrary functions
    const _boundsFunc = env.get('Bounds');
    const _inTicksFunc = env.get('InTicks');
    const _outTicksFunc = env.get('OutTicks');
    const _inOutTicksFunc = env.get('InOutTicks');
    function resolveAxis3Arg(a) {
      // Only call known axis specifier functions
      if (a === _boundsFunc || a === _inTicksFunc || a === _outTicksFunc || a === _inOutTicksFunc) {
        return a();
      }
      return a;
    }
    env.set('xaxis3', (...args) => {
      const pos = args.filter(a => !(a && a._named)).map(resolveAxis3Arg);
      let label = '', axisType = null, ticks = null, pen = null, arrow = null;
      for (const a of pos) {
        if (typeof a === 'string') label = a;
        else if (a && a._tag === 'Label') label = a.text;
        else if (a && a._tag === 'axis3type') axisType = a;
        else if (a && a._tag === 'ticks3') ticks = a;
        else if (isPen(a)) pen = a;
        else if (a && a._tag === 'arrow') arrow = a;
      }
      _draw3DAxis('x', label, axisType, ticks, pen, arrow, currentPic);
    });
    env.set('yaxis3', (...args) => {
      const pos = args.filter(a => !(a && a._named)).map(resolveAxis3Arg);
      let label = '', axisType = null, ticks = null, pen = null, arrow = null;
      for (const a of pos) {
        if (typeof a === 'string') label = a;
        else if (a && a._tag === 'Label') label = a.text;
        else if (a && a._tag === 'axis3type') axisType = a;
        else if (a && a._tag === 'ticks3') ticks = a;
        else if (isPen(a)) pen = a;
        else if (a && a._tag === 'arrow') arrow = a;
      }
      _draw3DAxis('y', label, axisType, ticks, pen, arrow, currentPic);
    });
    env.set('zaxis3', (...args) => {
      const pos = args.filter(a => !(a && a._named)).map(resolveAxis3Arg);
      let label = '', axisType = null, ticks = null, pen = null, arrow = null;
      for (const a of pos) {
        if (typeof a === 'string') label = a;
        else if (a && a._tag === 'Label') label = a.text;
        else if (a && a._tag === 'axis3type') axisType = a;
        else if (a && a._tag === 'ticks3') ticks = a;
        else if (isPen(a)) pen = a;
        else if (a && a._tag === 'arrow') arrow = a;
      }
      _draw3DAxis('z', label, axisType, ticks, pen, arrow, currentPic);
    });

    // Override point() to handle 3D box-relative coordinates in graph3
    // point(triple) returns the corner of the current bounding box
    // where triple components map: -1 = min, +1 = max
    const origPoint = env.get('point');
    env.set('point', (...args) => {
      // Check for 3D triple argument
      if (args.length === 1 && isTriple(args[0])) {
        const t = args[0];
        // Get the surface bounds from picture metadata, or use defaults
        const pic = currentPic;
        let minX = -Math.PI, maxX = Math.PI;
        let minY = -2, maxY = 2;
        let minZ = 0, maxZ = 4;
        // Try to find bounds from any drawn surfaces
        for (const c of pic.commands) {
          if (c.mesh && c.mesh.faces) {
            for (const face of c.mesh.faces) {
              for (const v of face.vertices || []) {
                if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
                if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
                if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
              }
            }
          }
        }
        // Map triple components to box coordinates
        const x = t.x < 0 ? minX : (t.x > 0 ? maxX : (minX + maxX) / 2);
        const y = t.y < 0 ? minY : (t.y > 0 ? maxY : (minY + maxY) / 2);
        const z = t.z < 0 ? minZ : (t.z > 0 ? maxZ : (minZ + maxZ) / 2);
        return makeTriple(x, y, z);
      }
      // Fall back to original point() for 2D geometry
      if (origPoint) return origPoint(...args);
      return args[0];
    });

    // Expose axis finalization for main interpreter to call
    env.set('_finalize3DAxes', _finalize3DAxes);
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
    // path3 wire-frame: iterate over edges
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a && a._tag === 'path3' && Array.isArray(a.edges)) {
        const rest = args.slice(0, i).concat(args.slice(i+1));
        const savedLine = args._line;
        for (const edge of a.edges) {
          const sub = [edge, ...rest];
          sub._line = savedLine;
          evalDraw(cmd, sub);
        }
        return;
      }
    }
    // Convert geometry types to drawable paths
    const savedLine = args._line;
    args = args.map(a => {
      if (isPoint(a)) return locatePoint(a);
      if (isGeoVector(a)) return locateVector(a);
      if (isGeoLine(a)) {
        const A = locatePoint(a.A), B = locatePoint(a.B);
        let p0 = A, p1 = B;
        if (a.extendA || a.extendB) {
          const dx = B.x-A.x, dy = B.y-A.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const far = 200;
          if (a.extendA) p0 = makePair(A.x - far*dx/len, A.y - far*dy/len);
          if (a.extendB) p1 = makePair(B.x + far*dx/len, B.y + far*dy/len);
        }
        return makePath([lineSegment(p0, p1)], false);
      }
      if (isGeoCircle(a)) {
        const C = toPair(a.C);
        return makeCirclePath(C, a.r);
      }
      if (isTriangleGeo(a)) {
        const A = locatePoint(a.A), B = locatePoint(a.B), C = locatePoint(a.C);
        return makePath([lineSegment(A,B), lineSegment(B,C), lineSegment(C,A)], true);
      }
      return a;
    });
    args._line = savedLine;
    // Detect draw(pair, path, pen) marker syntax: marker path is in bp/px units (fixed size)
    // In Asymptote, draw(pair z, path g, pen p) renders g in bp space at coordinate position z
    if (args.length >= 2 && isPair(args[0]) && isPath(args[1]) && args[1].segs && args[1].segs.length > 0) {
      const pos = args[0];
      const markerPath = args[1];
      let markerPen = null;
      for (let i = 2; i < args.length; i++) {
        if (isPen(args[i])) markerPen = markerPen ? mergePens(markerPen, args[i]) : args[i];
      }
      if (!markerPen) markerPen = clonePen(defaultPen);
      target.commands.push({cmd:'marker', pos, markerPath, pen:markerPen, line: args._line || 0});
      return;
    }
    // Handle draw(path[], pen) — array of paths (e.g. from contour())
    if (args.length >= 1 && isArray(args[0]) && args[0].length > 0 && isPath(args[0][0])) {
      const paths = args[0];
      let p = null;
      for (let i = 1; i < args.length; i++) {
        if (isPen(args[i])) p = p ? mergePens(p, args[i]) : args[i];
      }
      if (!p) p = clonePen(defaultPen);
      for (const path of paths) {
        target.commands.push({cmd, path, pen:clonePen(p), arrow:null, line: args._line || 0});
      }
      return;
    }
    // Handle draw(sphere(center, r), pen) — render as wireframe
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a && a._tag === 'sphere') {
        const C = a.center, R = a.radius;
        let spherePen = null;
        for (let j = 0; j < args.length; j++) {
          if (j === i) continue;
          if (isPen(args[j])) spherePen = spherePen ? mergePens(spherePen, args[j]) : args[j];
        }
        if (!spherePen) spherePen = clonePen(defaultPen);
        // Draw sphere as silhouette circle at projected center (matches Asymptote's
        // solids module output for draw(revolution,pen) — outline only, no wireframe).
        const centerProj = projectTriple(C);
        const nPts = 64;
        const pts = [];
        for (let j = 0; j <= nPts; j++) {
          const th = 2*Math.PI*j/nPts;
          pts.push(makePair(centerProj.x + R*Math.cos(th), centerProj.y + R*Math.sin(th)));
        }
        const segs = [];
        for (let m = 0; m < pts.length-1; m++) segs.push(lineSegment(pts[m], pts[m+1]));
        target.commands.push({cmd:'draw', path: makePath(segs, true), pen: clonePen(spherePen), arrow:null, line: args._line || 0});
        return;
      }
    }
    // Handle draw(triple[] v, int[][] vi, [triple[] n, int[][] ni,] pen|pen[], [int[][] pi])
    // — indexed triangle mesh from three.asy. Matches Asymptote's standalone
    // (non-PRC) renderer:
    //   * With per-vertex pens (pi): interpolate pen colors barycentrically,
    //     no normal-based shading (vertex colors ARE the shading).
    //   * Without per-vertex pens: apply Lambert with world +Z light direction
    //     (Asymptote's default Headlamp in viewport space maps to world +Z when
    //     viewportlight=true) using interpolated per-vertex normals.
    // Sub-triangles are emitted as raw fills (no stroke outlines) to avoid the
    // subdivision grid showing up.
    {
      const _isTripleArr = a => Array.isArray(a) && a.length > 0 && a.every(v => isTriple(v));
      const _isIntIntArr = a => Array.isArray(a) && a.length > 0 && a.every(v => Array.isArray(v) && v.every(x => typeof x === 'number'));
      const _isPenArr = a => Array.isArray(a) && a.length > 0 && a.every(v => isPen(v));
      if (args.length >= 2 && _isTripleArr(args[0]) && _isIntIntArr(args[1])) {
        const v = args[0];
        const vi = args[1];
        let k = 2;
        let normals = null, normalIdx = null;
        if (k < args.length && Array.isArray(args[k]) && (args[k].length === 0 || args[k].every(x => isTriple(x)))) {
          normals = args[k]; k++;
          if (k < args.length && Array.isArray(args[k]) && (args[k].length === 0 || (Array.isArray(args[k][0]) && args[k][0].every(x => typeof x === 'number')))) {
            normalIdx = args[k]; k++;
          }
        }
        let singlePen = null, penArr = null, pi = null;
        for (; k < args.length; k++) {
          const a = args[k];
          if (isPen(a)) singlePen = singlePen ? mergePens(singlePen, a) : a;
          else if (_isPenArr(a)) penArr = a;
          else if (_isIntIntArr(a)) pi = a;
        }
        const basePen = singlePen || clonePen(defaultPen);
        const _blendPens = (pens, weights) => {
          let r=0, g=0, b=0, op=0, hasOp=false, wSum=0;
          for (let i=0;i<pens.length;i++){
            const p=pens[i], w=weights[i];
            r+=w*(p.r||0); g+=w*(p.g||0); b+=w*(p.b||0);
            if (typeof p.opacity==='number'){ op+=w*p.opacity; hasOp=true; }
            wSum+=w;
          }
          if (wSum>0){ r/=wSum; g/=wSum; b/=wSum; op/=wSum; }
          const base = clonePen(pens[0]);
          base.r=r; base.g=g; base.b=b;
          if (hasOp) base.opacity=op;
          return base;
        };
        const _normalize = (n) => {
          const L = Math.sqrt(n.x*n.x + n.y*n.y + n.z*n.z) || 1;
          return {x:n.x/L, y:n.y/L, z:n.z/L};
        };
        const useVertexColors = !!(penArr && pi);
        const items = []; // { depth, poly: pair[], pen }

        for (let fi = 0; fi < vi.length; fi++) {
          const ix = vi[fi];
          if (!ix || ix.length < 3) continue;
          const verts3 = ix.map(i => v[i]).filter(t => isTriple(t));
          if (verts3.length < 3) continue;

          // Fan-triangulate polygons with >3 verts
          const triangles = [];
          if (verts3.length === 3) triangles.push([0, 1, 2]);
          else for (let t = 1; t < verts3.length - 1; t++) triangles.push([0, t, t+1]);

          for (const tri of triangles) {
            const V0 = verts3[tri[0]], V1 = verts3[tri[1]], V2 = verts3[tri[2]];
            const defaultN = faceNormal({vertices:[V0,V1,V2]});
            // Per-vertex normals (in world coords)
            let N0 = defaultN, N1 = defaultN, N2 = defaultN;
            if (normals && normalIdx && normalIdx[fi] && normalIdx[fi].length >= 3) {
              const nIdx = normalIdx[fi];
              const nx0 = normals[nIdx[tri[0]]], nx1 = normals[nIdx[tri[1]]], nx2 = normals[nIdx[tri[2]]];
              if (isTriple(nx0)) N0 = _normalize(nx0);
              if (isTriple(nx1)) N1 = _normalize(nx1);
              if (isTriple(nx2)) N2 = _normalize(nx2);
            }
            // Per-vertex pens
            let P0 = basePen, P1 = basePen, P2 = basePen;
            if (penArr && pi && pi[fi] && pi[fi].length >= 3) {
              const pIdx = pi[fi];
              if (isPen(penArr[pIdx[tri[0]]])) P0 = penArr[pIdx[tri[0]]];
              if (isPen(penArr[pIdx[tri[1]]])) P1 = penArr[pIdx[tri[1]]];
              if (isPen(penArr[pIdx[tri[2]]])) P2 = penArr[pIdx[tri[2]]];
            }

            // Emit a single filled sub-triangle with given corners, normals, pens
            const emitTri = (P1pt, P2pt, P3pt, ba, bb, bc) => {
              const pen = _blendPens([P0, P1, P2], [ba, bb, bc]);
              let finalPen;
              if (useVertexColors) {
                // Asymptote's offline PNG renderer treats indexed-mesh
                // per-vertex pens as opaque (opacity is a PRC-only effect
                // here; see 12837.asy comment). Strip opacity for fidelity.
                finalPen = clonePen(pen);
                if (typeof finalPen.opacity === 'number') delete finalPen.opacity;
              } else {
                const nI = _normalize({
                  x: ba*N0.x + bb*N1.x + bc*N2.x,
                  y: ba*N0.y + bb*N1.y + bc*N2.y,
                  z: ba*N0.z + bb*N1.z + bc*N2.z,
                });
                const intensity = Math.max(0, Math.abs(nI.z));
                finalPen = clonePen(pen);
                finalPen.r = (pen.r||0) * intensity;
                finalPen.g = (pen.g||0) * intensity;
                finalPen.b = (pen.b||0) * intensity;
              }
              // Project centroid for depth
              const cx = (P1pt.x+P2pt.x+P3pt.x)/3;
              const cy = (P1pt.y+P2pt.y+P3pt.y)/3;
              const cz = (P1pt.z+P2pt.z+P3pt.z)/3;
              // Depth = -z in view space (use camera if available)
              let depth;
              if (projection) {
                const dx = projection.cx - cx, dy = projection.cy - cy, dz = projection.cz - cz;
                depth = Math.sqrt(dx*dx + dy*dy + dz*dz);
              } else {
                depth = -cz;
              }
              const T1 = makeTriple(P1pt.x, P1pt.y, P1pt.z);
              const T2 = makeTriple(P2pt.x, P2pt.y, P2pt.z);
              const T3 = makeTriple(P3pt.x, P3pt.y, P3pt.z);
              const poly = [projectTriple(T1), projectTriple(T2), projectTriple(T3)];
              items.push({depth, poly, pen: finalPen});
            };

            // Subdivide the triangle (N×N) for smooth gradient
            const N = 16;
            // Grid g[i][j] with i+j<=N, bary = ((N-i-j)/N, i/N, j/N)
            const gp = [];
            for (let i = 0; i <= N; i++) {
              gp[i] = [];
              for (let j = 0; j <= N - i; j++) {
                const a = (N-i-j)/N, b = i/N, c = j/N;
                gp[i][j] = {
                  x: a*V0.x + b*V1.x + c*V2.x,
                  y: a*V0.y + b*V1.y + c*V2.y,
                  z: a*V0.z + b*V1.z + c*V2.z,
                  a, b, c,
                };
              }
            }
            for (let i = 0; i < N; i++) {
              for (let j = 0; j < N - i; j++) {
                const p1 = gp[i][j], p2 = gp[i+1][j], p3 = gp[i][j+1];
                emitTri(p1, p2, p3,
                        (p1.a+p2.a+p3.a)/3,
                        (p1.b+p2.b+p3.b)/3,
                        (p1.c+p2.c+p3.c)/3);
                if (j + 1 <= N - i - 1) {
                  const q1 = gp[i+1][j], q2 = gp[i+1][j+1], q3 = gp[i][j+1];
                  emitTri(q1, q2, q3,
                          (q1.a+q2.a+q3.a)/3,
                          (q1.b+q2.b+q3.b)/3,
                          (q1.c+q2.c+q3.c)/3);
                }
              }
            }
          }
        }
        // Painter's sort: farthest first
        items.sort((a, b) => b.depth - a.depth);
        const lineNo = args._line || 0;
        for (const it of items) {
          const segs = [];
          for (let i = 0; i < it.poly.length; i++) {
            segs.push(lineSegment(it.poly[i], it.poly[(i+1) % it.poly.length]));
          }
          const p = makePath(segs, true);
          target.commands.push({cmd:'fill', path: p, pen: it.pen, line: lineNo});
        }
        return;
      }
    }
    // Handle draw(revolution, int n, pen [, longitudinalpen=pen]) — skeleton only.
    // Draws n latitudinal circles + (by default) a few longitudinal arcs.
    {
      const revArg = args.find(a => a && a._tag === 'revolution' && a._grid);
      const intArg = args.find(a => typeof a === 'number' && Number.isInteger(a) && a > 0);
      const hasInt = args.some(a => typeof a === 'number' && Number.isInteger(a) && a > 0);
      if (revArg && hasInt) {
        const grid = revArg._grid; // rotated[j][i]: (nLon+1) × (verts.length)
        const nLon = grid.length - 1;
        const nPath = grid[0] ? grid[0].length : 0;
        if (nLon >= 2 && nPath >= 2) {
          // Collect pens and named args
          let pen = null;
          let longPen = null; // longitudinalpen
          let gotLongNamed = false;
          for (const a of args) {
            if (a && a._named) {
              if ('longitudinalpen' in a) {
                longPen = a.longitudinalpen;
                gotLongNamed = true;
              }
            }
          }
          // Named-arg parsing currently evaluates `longitudinalpen=nullpen` as
          // a bare positional pen. Fallback: if a positional zero-opacity pen
          // appears alongside another opaque pen, treat it as longitudinalpen.
          const opaquePens = args.filter(a => isPen(a) && a.opacity !== 0);
          const nullPens = args.filter(a => isPen(a) && a.opacity === 0);
          if (!gotLongNamed && opaquePens.length > 0 && nullPens.length > 0) {
            longPen = nullPens[0];
            gotLongNamed = true;
          }
          for (const a of args) {
            if (isPen(a) && a.opacity !== 0) { pen = pen ? mergePens(pen, a) : a; }
          }
          if (!pen) pen = clonePen(defaultPen);
          const isNullPen = (p) => !p || !isPen(p) || (p.opacity === 0);
          const nLat = Math.max(1, intArg);
          const lineNo = args._line || 0;
          const emitCurve3 = (pts, usedPen, dashed) => {
            if (!pts || pts.length < 2) return;
            // Depth-sort chunks by midpoint for rough occlusion
            const segs2 = [];
            for (let k = 0; k < pts.length - 1; k++) {
              const a = pts[k], b = pts[k+1];
              const pa = projectTriple(a), pb = projectTriple(b);
              segs2.push(lineSegment(pa, pb));
            }
            const path = makePath(segs2, false);
            const myPen = clonePen(usedPen);
            if (dashed) myPen.dashpattern = '2 2';
            target.commands.push({cmd:'draw', path, pen: myPen, arrow: null, line: lineNo});
          };
          // Latitudinal circles at nLat path-positions. For each path-index i,
          // the latitudinal ring goes across all j (the revolution).
          // Map nLat to indices evenly spanning [0, nPath-1].
          for (let t = 0; t < nLat; t++) {
            // Parameter along the path from 0 to 1 — sample in interior
            const pParam = (nLat === 1) ? 0.5 : (t + 0.5) / nLat;
            const fidx = pParam * (nPath - 1);
            const i0 = Math.max(0, Math.min(nPath - 1, Math.floor(fidx)));
            const i1 = Math.max(0, Math.min(nPath - 1, i0 + 1));
            const tt = fidx - i0;
            const pts = [];
            for (let j = 0; j <= nLon; j++) {
              const a = grid[j][i0], b = grid[j][i1];
              pts.push(makeTriple(
                a.x + (b.x - a.x) * tt,
                a.y + (b.y - a.y) * tt,
                a.z + (b.z - a.z) * tt
              ));
            }
            // Close the ring if revolution is full circle (detect via duplicate endpoints)
            const a0 = grid[0][i0], aL = grid[nLon][i0];
            const closed = Math.abs(a0.x - aL.x) < 1e-6 && Math.abs(a0.y - aL.y) < 1e-6 && Math.abs(a0.z - aL.z) < 1e-6;
            if (closed) pts.push(pts[0]);
            // Front half solid, back half dashed — simple heuristic:
            //   Project ring; split where line crosses the ring's interior.
            // For simplicity, just draw the whole ring with the pen (no dashing).
            emitCurve3(pts, pen, false);
          }
          // Longitudinal arcs (unless longitudinalpen=nullpen)
          if (!gotLongNamed || !isNullPen(longPen)) {
            const longP = longPen || pen;
            const nLongs = 4;
            for (let k = 0; k < nLongs; k++) {
              // Pick the j-index closest to evenly spaced full-turn fractions
              const jFrac = k / nLongs; // 0, 0.25, 0.5, 0.75
              const jIdx = Math.max(0, Math.min(nLon, Math.round(jFrac * nLon)));
              const pts = [];
              for (let i = 0; i < nPath; i++) pts.push(grid[jIdx][i]);
              emitCurve3(pts, longP, false);
            }
          }
          return;
        }
      }
    }
    // Handle draw(revolution, pen) WITHOUT an integer — solids.asy silhouette mode
    // Draws the outline of the revolution surface with hidden-line dashing
    {
      const revArg = args.find(a => a && a._tag === 'revolution' && a._grid);
      const hasInt = args.some(a => typeof a === 'number' && Number.isInteger(a) && a > 0);
      if (revArg && !hasInt) {
        let pen = null;
        for (const a of args) {
          if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
        }
        if (!pen) pen = clonePen(defaultPen);
        const lineNo = args._line || 0;
        const grid = revArg._grid; // rotated[j][i]: (nLon+1) × nPath
        const nLon = grid.length - 1;
        const nPath = grid[0] ? grid[0].length : 0;
        if (nLon >= 2 && nPath >= 2) {
          // For a cylinder: nPath=2 (bottom ring at i=0, top ring at i=1)
          // Top ellipse: grid[j][nPath-1] for all j
          // Bottom ellipse: grid[j][0] for all j
          // Side edges: we need to find the silhouette - the two j indices where the surface
          // normal is perpendicular to the view direction

          // Get camera direction (view axis)
          let vx = 0, vy = 0, vz = 1;
          if (projection) {
            vx = projection.cx - (projection.tx || 0);
            vy = projection.cy - (projection.ty || 0);
            vz = projection.cz - (projection.tz || 0);
            const vl = Math.sqrt(vx*vx + vy*vy + vz*vz) || 1;
            vx /= vl; vy /= vl; vz /= vl;
          }

          // Emit a curve from 3D points
          const emitCurve = (pts, usedPen, dashed) => {
            if (!pts || pts.length < 2) return;
            const segs2 = [];
            for (let k = 0; k < pts.length - 1; k++) {
              const a = pts[k], b = pts[k+1];
              const pa = projectTriple(a), pb = projectTriple(b);
              segs2.push(lineSegment(pa, pb));
            }
            const path = makePath(segs2, false);
            const myPen = clonePen(usedPen);
            if (dashed) myPen.linestyle = '4 4';  // Custom dash pattern matching Asymptote's hidden-line style
            target.commands.push({cmd:'draw', path, pen: myPen, arrow: null, line: lineNo});
          };

          // Draw top ellipse (always fully visible for typical top-down views)
          const topPts = [];
          for (let j = 0; j <= nLon; j++) topPts.push(grid[j][nPath - 1]);
          emitCurve(topPts, pen, false);

          // Draw bottom ellipse - determine front vs back by comparing normal to view
          // Bottom ellipse normal points down (in axis direction, negated)
          // If the view is looking at the top, the bottom front is visible, back is hidden
          // Split the ellipse: find where the surface tangent aligns with the view
          // For simplicity, use the projected ellipse: front half solid, back half dashed
          // The "front" is the half closer to the viewer

          // Project bottom ellipse and find the leftmost/rightmost extremes
          const botPts = [];
          for (let j = 0; j <= nLon; j++) botPts.push(grid[j][0]);

          // Find centroid of bottom ellipse (in 3D)
          let cx = 0, cy = 0, cz = 0;
          for (let j = 0; j < nLon; j++) {
            cx += botPts[j].x; cy += botPts[j].y; cz += botPts[j].z;
          }
          cx /= nLon; cy /= nLon; cz /= nLon;

          // For each point, determine if it's on the front or back
          // Front = the half of the ellipse closer to the camera along the view direction
          // dot(pt - center, viewDir) > 0 means front
          const frontPts = [], backPts = [];
          const frontIdx = [], backIdx = [];
          for (let j = 0; j <= nLon; j++) {
            const p = botPts[j];
            const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
            const dot = dx*vx + dy*vy + dz*vz;
            if (dot >= 0) {
              frontPts.push(p);
              frontIdx.push(j);
            } else {
              backPts.push(p);
              backIdx.push(j);
            }
          }

          // Draw front (solid) and back (dashed) portions
          // We need to draw them as continuous curves, so find transition points
          // and draw arcs between them
          let transitions = [];
          for (let j = 0; j < nLon; j++) {
            const p1 = botPts[j], p2 = botPts[j+1];
            const d1 = (p1.x-cx)*vx + (p1.y-cy)*vy + (p1.z-cz)*vz;
            const d2 = (p2.x-cx)*vx + (p2.y-cy)*vy + (p2.z-cz)*vz;
            if ((d1 >= 0 && d2 < 0) || (d1 < 0 && d2 >= 0)) {
              transitions.push(j);
            }
          }

          // If we found exactly 2 transitions, draw two arcs
          if (transitions.length === 2) {
            const t1 = transitions[0], t2 = transitions[1];
            // Arc1: from t1 to t2 (one half of the ellipse)
            const arc1 = [];
            for (let j = t1; j <= t2; j++) arc1.push(botPts[j]);
            // Arc2: from t2 to t1 wrapping around (other half)
            const arc2 = [];
            for (let j = t2; j <= nLon; j++) arc2.push(botPts[j]);
            for (let j = 0; j <= t1; j++) arc2.push(botPts[j]);

            // Determine which arc is front (closer to viewer = higher dot with view)
            // Check midpoint of arc1
            const mid1Idx = Math.floor(arc1.length / 2);
            const mid1 = arc1[mid1Idx];
            const d1 = (mid1.x - cx) * vx + (mid1.y - cy) * vy + (mid1.z - cz) * vz;

            // Front arc (positive dot = toward viewer) is solid
            // Back arc (negative dot = away from viewer) is dashed
            if (d1 >= 0) {
              emitCurve(arc1, pen, false);  // arc1 is front, solid
              emitCurve(arc2, pen, true);   // arc2 is back, dashed
            } else {
              emitCurve(arc1, pen, true);   // arc1 is back, dashed
              emitCurve(arc2, pen, false);  // arc2 is front, solid
            }
          } else {
            // Fallback: just draw the whole ellipse solid
            emitCurve(botPts, pen, false);
          }

          // Draw the two side edges (silhouette lines)
          // These are at the transition points where the surface normal is perpendicular to view
          if (transitions.length === 2) {
            const t1 = transitions[0], t2 = transitions[1];
            // Side edge 1: from bottom[t1] to top[t1]
            const side1 = [];
            for (let i = 0; i < nPath; i++) side1.push(grid[t1][i]);
            emitCurve(side1, pen, false);
            // Side edge 2: from bottom[t2] to top[t2]
            const side2 = [];
            for (let i = 0; i < nPath; i++) side2.push(grid[t2][i]);
            emitCurve(side2, pen, false);
          } else {
            // Fallback: draw edges at 0 and nLon/2
            const side1 = [];
            for (let i = 0; i < nPath; i++) side1.push(grid[0][i]);
            emitCurve(side1, pen, false);
            const side2 = [];
            for (let i = 0; i < nPath; i++) side2.push(grid[Math.floor(nLon/2)][i]);
            emitCurve(side2, pen, false);
          }

          return;
        }
      }
    }
    // Handle draw(mesh, pen) or draw(surface{mesh}, pen) — shaded, depth-sorted faces
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      let mesh = null;
      let surfForColors = null;
      if (isMesh(a)) mesh = a;
      else if (a && a._tag === 'surface' && a.mesh) { mesh = a.mesh; surfForColors = a; }
      else if (a && a._tag === 'revolution' && a.mesh) mesh = a.mesh;
      else if (a && a._tag === 'tube' && a.s && a.s.mesh) { mesh = a.s.mesh; surfForColors = a.s; }
      if (mesh) {
        // Track 3D bounds from mesh faces for axis3 drawing
        if (!target._3dBounds) target._3dBounds = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity};
        const b = target._3dBounds;
        for (const face of mesh.faces || []) {
          for (const v of face.vertices || []) {
            const vx = typeof v.x === 'number' ? v.x : 0;
            const vy = typeof v.y === 'number' ? v.y : 0;
            const vz = typeof v.z === 'number' ? v.z : 0;
            if (vx < b.minX) b.minX = vx; if (vx > b.maxX) b.maxX = vx;
            if (vy < b.minY) b.minY = vy; if (vy > b.maxY) b.maxY = vy;
            if (vz < b.minZ) b.minZ = vz; if (vz > b.maxZ) b.maxZ = vz;
          }
        }
        // Also track from _grid if available
        if (surfForColors && surfForColors._grid) {
          for (const row of surfForColors._grid) {
            for (const v of row) {
              const vx = typeof v.x === 'number' ? v.x : 0;
              const vy = typeof v.y === 'number' ? v.y : 0;
              const vz = typeof v.z === 'number' ? v.z : 0;
              if (vx < b.minX) b.minX = vx; if (vx > b.maxX) b.maxX = vx;
              if (vy < b.minY) b.minY = vy; if (vy > b.maxY) b.maxY = vy;
              if (vz < b.minZ) b.minZ = vz; if (vz > b.maxZ) b.maxZ = vz;
            }
          }
        }
        let meshPen = null;
        for (let j = 0; j < args.length; j++) {
          if (j === i) continue;
          if (isPen(args[j])) meshPen = meshPen ? mergePens(meshPen, args[j]) : args[j];
        }
        if (!meshPen) meshPen = clonePen(defaultPen);
        // If surface is a triangulated isosurface with per-vertex colors, annotate
        // each face with a pen averaged across the vertex pens referenced by its
        // _vidx (indices into the flat _vertices list).
        if (surfForColors && Array.isArray(surfForColors._colors) && surfForColors._colors.length > 0 &&
            Array.isArray(surfForColors._faceVertexIdx)) {
          const cols = surfForColors._colors;
          const fvi = surfForColors._faceVertexIdx;
          const avgPens = (pens) => {
            let r=0, g=0, b=0, a=0, n=0, hasOp=false;
            for (const p of pens) {
              if (!p || !isPen(p)) continue;
              r += p.r||0; g += p.g||0; b += p.b||0;
              if (typeof p.opacity === 'number') { a += p.opacity; hasOp = true; }
              n++;
            }
            if (n === 0) return null;
            const out = clonePen(pens[0]);
            out.r = r/n; out.g = g/n; out.b = b/n;
            if (hasOp) out.opacity = a/n;
            return out;
          };
          const newFaces = mesh.faces.map((f, fi) => {
            const idx = fvi[fi];
            if (!idx) return f;
            const pens = idx.map(k => cols[k]);
            const pen = avgPens(pens);
            if (pen) return {...f, pen};
            return f;
          });
          mesh = {_tag:'mesh', faces: newFaces};
        }
        // If surface has per-vertex _colors from s.colors(palette(...)), annotate
        // each face with a pen averaged across its 4 grid-vertex colors.
        else if (surfForColors && Array.isArray(surfForColors._colors) && surfForColors._colors.length > 0 && surfForColors._gridCols) {
          const cols = surfForColors._colors;
          const gCols = surfForColors._gridCols;
          const gRows = surfForColors._gridRows;
          const cyclic = !!surfForColors._gridCyclic;
          const idx = (i, j) => {
            if (cyclic) j = ((j % gCols) + gCols) % gCols;
            if (i < 0) i = 0; if (i >= gRows) i = gRows - 1;
            if (!cyclic) { if (j < 0) j = 0; if (j >= gCols) j = gCols - 1; }
            return i * gCols + j;
          };
          const avg4 = (pens) => {
            let r=0, g=0, b=0, a=0, n=0, hasOp=false;
            for (const p of pens) {
              if (!p || !isPen(p)) continue;
              r += p.r||0; g += p.g||0; b += p.b||0;
              if (typeof p.opacity === 'number') { a += p.opacity; hasOp = true; }
              n++;
            }
            if (n === 0) return null;
            const out = clonePen(pens[0]);
            out.r = r/n; out.g = g/n; out.b = b/n;
            if (hasOp) out.opacity = a/n;
            return out;
          };
          const newFaces = mesh.faces.map(f => {
            if (typeof f._gi === 'number' && typeof f._gj === 'number') {
              const i0 = f._gi, j0 = f._gj;
              const c00 = cols[idx(i0, j0)];
              const c10 = cols[idx(i0+1, j0)];
              const c11 = cols[idx(i0+1, j0+1)];
              const c01 = cols[idx(i0, j0+1)];
              const pen = avg4([c00, c10, c11, c01]);
              if (pen) return {...f, pen, _fromPalette: true};
            }
            return f;
          });
          mesh = {_tag:'mesh', faces: newFaces};
        }
        renderMeshToPicture(mesh, meshPen, target, args._line || 0);
        return;
      }
    }
    // Handle draw(surface(path3), pen) — render as filled polygon
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a && a._tag === 'surface' && a.boundary) {
        const surfPath = a.boundary;
        projectPathTriples(surfPath);
        let surfPen = null;
        for (let j = 0; j < args.length; j++) {
          if (j === i) continue;
          if (isPen(args[j])) surfPen = surfPen ? mergePens(surfPen, args[j]) : args[j];
        }
        if (!surfPen) surfPen = clonePen(defaultPen);
        target.commands.push({ cmd: 'fill', path: surfPath, pen: surfPen, line: args._line || 0 });
        return;
      }
    }
    let pathArg = null, pen = null, drawPen = null, arrow = null;
    let labelText = null, labelAlign = null, labelPosition = null, labelTransform = null;
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
      else if (a && a._tag === 'label') {
        if (!labelText) { labelText = a.text || ''; if (a.align) labelAlign = a.align; if (a.position != null) labelPosition = a.position; if (a.transform) labelTransform = a.transform; }
      }
      else if (isString(a) && !labelText && !pathArg) { labelText = a; }
      else if (isTriple(a) && !pathArg) {
        pathArg = makePath([], false);
        pathArg._singlePoint = projectTriple(a);
      }
      else if (isPair(a)) {
        if (!pathArg && !labelText) {
          pathArg = makePath([], false);
          pathArg._singlePoint = a;
        } else if (labelText && !labelAlign) {
          labelAlign = a; // alignment for draw label
        }
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
      // If draw call has a label, place it along the path at the specified position
      if (labelText && pathArg.segs && pathArg.segs.length > 0) {
        const t = (labelPosition != null) ? labelPosition : 0.5; // default midpoint
        // Compute position at parameter t along the path (0=begin, 1=end)
        const totalSegs = pathArg.segs.length;
        const segParam = t * totalSegs;
        const segIdx = Math.min(Math.floor(segParam), totalSegs - 1);
        const localT = segParam - segIdx;
        const seg = pathArg.segs[segIdx];
        // De Casteljau evaluation for cubic Bezier at localT
        const b = (1 - localT);
        const px = b*b*b*seg.p0.x + 3*b*b*localT*seg.cp1.x + 3*b*localT*localT*seg.cp2.x + localT*localT*localT*seg.p3.x;
        const py = b*b*b*seg.p0.y + 3*b*b*localT*seg.cp1.y + 3*b*localT*localT*seg.cp2.y + localT*localT*localT*seg.p3.y;
        const labelPos = makePair(px, py);
        const ldc = {cmd:'label', text:labelText, pos:labelPos, align:labelAlign, pen, line: args._line || 0};
        if (labelTransform) ldc.labelTransform = labelTransform;
        target.commands.push(ldc);
      }
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
    // path3 wire-frame: dot each unique vertex (projected)
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a && a._tag === 'path3' && Array.isArray(a.vertices)) {
        const rest = args.slice(0, i).concat(args.slice(i+1));
        const savedLine0 = args._line;
        for (const v of a.vertices) {
          const sub = [v, ...rest];
          sub._line = savedLine0;
          evalDot(sub);
        }
        return;
      }
    }
    // Convert geometry points to pairs
    const savedLine = args._line;
    args = args.map(a => isPoint(a) ? locatePoint(a) : (isGeoVector(a) ? locateVector(a) : a));
    args._line = savedLine;
    let pos = null, pen = null, text = null, align = null, multiDots = null;
    let graphicData = null, filltype = null;
    for (const a of args) {
      if (a && a._tag === 'filltype') { filltype = a; continue; }
      if (a && a._tag === 'label') {
        if (!text) text = a.text || '';
        if (a.align && !align) align = a.align;
        if (a.pen) pen = pen ? mergePens(pen, a.pen) : a.pen;
        if (isPair(a.position) && !pos) pos = a.position;
        // Handle case where position is stored in align field (e.g., Label(text, position, alignment))
        if (!pos && isPair(a.align)) pos = a.align;
      }
      else if (isGraphic(a) && !graphicData) graphicData = a;
      else if (isTriple(a)) {
        if (!pos) pos = projectTriple(a);
        else if (!align) align = projectTriple(a);
      }
      else if (isPair(a)) {
        if (!pos) pos = a;
        else if (!align) align = a;
      }
      else if (typeof a === 'number' && !pos) { pos = makePair(a, 0); }
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
        target.commands.push({cmd:'dot', pos:pt, pen, filltype, line: args._line || 0});
      }
      return;
    }
    if (!pos) return;
    target.commands.push({cmd:'dot', pos, pen, filltype, line: args._line || 0});
    // If dot has a graphic, add an image command
    if (graphicData) {
      if (!align) align = makePair(1, 1);
      target.commands.push({cmd:'image', graphic: graphicData, pos, align, pen, line: args._line || 0});
    }
    // If dot has a label, add it too
    else if (text && text.trim()) {
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
    // Convert geometry points to pairs
    const savedLine = args._line;
    args = args.map(a => isPoint(a) ? locatePoint(a) : (isGeoVector(a) ? locateVector(a) : a));
    args._line = savedLine;
    let text = '', pos = null, align = null, pen = null, filltype = null, labelTransform = null;
    let graphicData = null;
    for (const a of args) {
      if (isGraphic(a) && !graphicData) {
        graphicData = a;
      }
      else if (a && a._tag === 'label') {
        if (a._graphic && !graphicData) { graphicData = a._graphic; }
        else if (!text) text = a.text || '';
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
      else if (typeof a === 'number' && !pos) { pos = makePair(a, 0); }
      else if (isPen(a)) pen = pen ? mergePens(pen, a) : a;
    }
    if (!pos) pos = makePair(0,0);
    if (!pen) pen = clonePen(defaultPen);

    // AoPS-corrupted \t escapes: labels with TAB before letters are the result
    // of "\t<letter>" being collapsed to a single TAB byte.  TeX treats the
    // TAB as whitespace in both text mode and math mode, so the reference
    // rendering simply drops the TAB and prints the remaining letters
    // (e.g. "(tab)heta" → "heta", "(tab)extdollar" → "extdollar").  Mirror
    // that by stripping the TAB character entirely.
    if (typeof text === 'string' && text.indexOf('\t') !== -1) {
      text = text.replace(/\t/g, '');
    }

    // LaTeX \begin{tabular}...\end{tabular} environment in label text:
    // flatten to newline-separated rows (the multi-line label renderer further
    // downstream uses \n as the row separator).  Column separators (&) are
    // replaced with spaces — our label system doesn't lay out tabular columns,
    // but the visual approximation (stacked rows) matches what Asymptote
    // produces here (e.g. a 1-column {c} tabular used only for line breaks).
    if (typeof text === 'string' && /\\begin\s*\{tabular\}/.test(text)) {
      text = text.replace(
        /\\begin\s*\{tabular\}\s*(?:\{[^}]*\})?([\s\S]*?)\\end\s*\{tabular\}/g,
        (_m, body) => {
          // Split rows on \\, drop empty trailing row, replace & with space
          const rows = body.split(/\\\\/).map(r => r.replace(/&/g, ' ').trim()).filter(r => r.length > 0);
          return rows.join('\n');
        }
      );
    }

    if (graphicData) {
      // Compose any labelTransform into the graphic's transform
      if (labelTransform) {
        const existing = graphicData.transform;
        const t = existing ? composeTransforms(existing, labelTransform) : labelTransform;
        graphicData = Object.assign({}, graphicData, {transform: t});
      }
      target.commands.push({cmd:'image', graphic: graphicData, pos, align, pen, line: args._line || 0});
    } else {
      const labelCmd = {cmd:'label', text, pos, align, pen, filltype, line: args._line || 0};
      if (labelTransform) labelCmd.labelTransform = labelTransform;
      target.commands.push(labelCmd);
    }
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

  // ============================================================
  // 3D Mesh rendering: depth-sort faces (painter's), Lambert shade, emit fills
  // ============================================================
  function renderMeshToPicture(mesh, basePen, target, line) {
    if (!mesh || !mesh.faces || mesh.faces.length === 0) return;
    const proj = projection;
    // View axis (camera - target), normalized — used both for depth and light
    let vx, vy, vz, camPos;
    if (proj) {
      const tx = proj.tx || 0, ty = proj.ty || 0, tz = proj.tz || 0;
      vx = proj.cx - tx; vy = proj.cy - ty; vz = proj.cz - tz;
      camPos = {x: proj.cx, y: proj.cy, z: proj.cz};
    } else {
      vx = 0; vy = 0; vz = 1; camPos = {x: 0, y: 0, z: 100};
    }
    const vl = Math.sqrt(vx*vx + vy*vy + vz*vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;
    // Lambert from "viewport" light (along view axis, toward viewer)
    // For orthographic: parallel light along +view. For perspective: roughly same.
    const lx = vx, ly = vy, lz = vz;

    // Compute per-face data: depth (view-space), shade, projected 2D polygon
    const items = [];
    for (const face of mesh.faces) {
      const V = face.vertices;
      if (!V || V.length < 3) continue;
      // Face centroid in world space
      let cx = 0, cy = 0, cz = 0;
      for (const v of V) { cx += v.x; cy += v.y; cz += v.z; }
      cx /= V.length; cy /= V.length; cz /= V.length;
      // Depth = distance from camera along view axis (positive = far from camera)
      // For painter: we want to draw farthest first → sort descending by distance.
      // distance = dot(cam - centroid, viewAxis) — but simpler: -dot(centroid - target, viewAxis)
      // Use distance from camera:
      const depth = Math.sqrt(
        (camPos.x-cx)*(camPos.x-cx) +
        (camPos.y-cy)*(camPos.y-cy) +
        (camPos.z-cz)*(camPos.z-cz));
      // Normal (may already be cached)
      const n = face.normal || faceNormal(face);
      // Lambert: intensity = |n · L|; use abs so back-facing faces still lit
      // (acceptable shortcut since we're not doing true back-face culling).
      // For closed surfaces (mesh._closed), back-face culling hides interior faces
      // so adjacent rings don't bleed through and mask the 3D shape.
      let dot = n.x*lx + n.y*ly + n.z*lz;
      if (mesh && mesh._closed && dot < 0) continue; // back-face cull
      if (dot < 0) dot = -dot;
      const intensity = 0.35 + 0.65 * dot;
      // Project polygon
      const poly = V.map(v => projectTriple(v));
      items.push({depth, intensity, poly, pen: face.pen || basePen});
    }
    // Sort: farthest first
    items.sort((a, b) => b.depth - a.depth);
    // Emit fill commands
    for (const it of items) {
      const base = it.pen;
      const shaded = clonePen(base);
      shaded.r = Math.max(0, Math.min(1, base.r * it.intensity));
      shaded.g = Math.max(0, Math.min(1, base.g * it.intensity));
      shaded.b = Math.max(0, Math.min(1, base.b * it.intensity));
      const segs = [];
      for (let i = 0; i < it.poly.length; i++) {
        const a = it.poly[i];
        const b = it.poly[(i+1) % it.poly.length];
        segs.push(lineSegment(a, b));
      }
      const p = makePath(segs, true);
      target.commands.push({cmd: 'fill', path: p, pen: shaded, line});
      // Add thin stroke to close antialiasing gaps between adjacent faces
      const stroke = clonePen(shaded);
      stroke.linewidth = Math.max(0.2, stroke.linewidth || 0.2);
      target.commands.push({cmd: 'draw', path: p, pen: stroke, arrow: null, line});
    }
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
  function execute(code, opts) {
    opts = opts || {};
    _imageCache = opts.imageCache || {};
    // Reset state
    drawCommands.length = 0;
    currentPic = {_tag:'picture', commands:[]};
    globalEnv.update('currentpicture', currentPic);
    projection = null;
    _projectedTriples.length = 0;
    unitScale = 1; hasUnitScale = false;
    sizeW = 0; sizeH = 0; keepAspect = true;
    defaultPen = makePen({});
    _axisLimits = { xmin: null, xmax: null, ymin: null, ymax: null, crop: false };

    // Restore any built-in functions that were shadowed by user variables in a
    // previous execution (e.g. `real scale = 0.02;` overwrote `scale` function).
    for (const [name, fn] of _builtinFuncs) {
      globalEnv.set(name, fn);
    }
    _builtinFuncs.clear();

    // Auto-install graph package — many AoPS codes use graph functions without import
    graphPackageInstalled = false; // Reset so it re-installs with fresh state
    installGraphPackage(globalEnv);

    const tokens = lex(code);
    const ast = parse(tokens);

    // Walk AST and track source lines for draw commands
    patchDrawLines(ast, globalEnv);

    evalNode(ast, globalEnv);

    // If projection has center=true, compute 3D bbox centroid of all tracked
    // triples, set projection target to centroid, and re-project every tracked
    // triple in-place so downstream draw commands see the centred scene.
    if (projection && projection.center && _projectedTriples.length > 0) {
      let xmin = Infinity, ymin = Infinity, zmin = Infinity;
      let xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
      for (const e of _projectedTriples) {
        const t = e.triple;
        if (t.x < xmin) xmin = t.x;
        if (t.y < ymin) ymin = t.y;
        if (t.z < zmin) zmin = t.z;
        if (t.x > xmax) xmax = t.x;
        if (t.y > ymax) ymax = t.y;
        if (t.z > zmax) zmax = t.z;
      }
      if (isFinite(xmin) && isFinite(xmax)) {
        const cx = (xmin + xmax) / 2;
        const cy = (ymin + ymax) / 2;
        const cz = (zmin + zmax) / 2;
        // Shift camera by same delta so it keeps its relative position
        const dtx = cx - (projection.tx || 0);
        const dty = cy - (projection.ty || 0);
        const dtz = cz - (projection.tz || 0);
        projection.tx = cx;
        projection.ty = cy;
        projection.tz = cz;
        projection.cx += dtx;
        projection.cy += dty;
        projection.cz += dtz;
        // Prevent infinite recursion in projectTriple's adjust code during re-projection
        projection.center = false;
        for (const entry of _projectedTriples) {
          const rp = _projectTripleRaw(entry.triple, projection);
          entry.result.x = rp.x;
          entry.result.y = rp.y;
        }
      }
    }

    // Finalize 3D axes now that bounds are known
    const _finalize3DAxes = globalEnv.get('_finalize3DAxes');
    if (typeof _finalize3DAxes === 'function') {
      _finalize3DAxes(currentPic);
    }

    // Copy currentpicture's commands to drawCommands for rendering
    for (const c of currentPic.commands) drawCommands.push(c);

    // Read dotfactor from environment (default 6)
    const dotfactorVal = globalEnv.get('dotfactor');
    const dotfactor = (typeof dotfactorVal === 'number' && dotfactorVal > 0) ? dotfactorVal : 6;

    // Read currentlight for background color
    const currentlight = globalEnv.get('currentlight');

    return {
      drawCommands: drawCommands.slice(),
      unitScale, hasUnitScale,
      sizeW, sizeH, keepAspect,
      defaultPen,
      axisLimits: Object.assign({}, _axisLimits),
      dotfactor,
      currentlight,
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

// Compute display size of a graphic() in user coordinates
function computeGraphicDisplaySize(graphic, unitScale, hasUnitScale) {
  const w_bp = graphic.width_bp || 100;
  const h_bp = graphic.height_bp || 100;
  const aspect = w_bp / (h_bp || 1);

  // Parse options string for explicit dimensions (e.g. "height=2cm", "width=3in")
  const opts = graphic.options || '';
  const unitToBP = { cm: 28.3465, mm: 2.83465, in: 72, pt: 1, bp: 1, pc: 12, dd: 1.07, cc: 12.84 };

  let target_w_bp = null, target_h_bp = null;
  const hm = opts.match(/height\s*=\s*([\d.]+)\s*([a-z]+)/i);
  const wm = opts.match(/width\s*=\s*([\d.]+)\s*([a-z]+)/i);
  if (hm) {
    const val = parseFloat(hm[1]);
    const conv = unitToBP[hm[2]] || 1;
    target_h_bp = val * conv;
    target_w_bp = target_h_bp * aspect;
  }
  if (wm) {
    const val = parseFloat(wm[1]);
    const conv = unitToBP[wm[2]] || 1;
    target_w_bp = val * conv;
    if (!hm) target_h_bp = target_w_bp / aspect;
  }

  // Default: use intrinsic size
  const display_w_bp = target_w_bp || w_bp;
  const display_h_bp = target_h_bp || h_bp;

  // Convert from bp to user coordinates
  const scale = hasUnitScale ? unitScale : 1;
  const display_w_user = scale > 0 ? display_w_bp / scale : display_w_bp;
  const display_h_user = scale > 0 ? display_h_bp / scale : display_h_bp;

  return { w_user: display_w_user, h_user: display_h_user, w_bp: display_w_bp, h_bp: display_h_bp };
}

function renderSVG(result, opts) {
  opts = opts || {};
  const { drawCommands, unitScale, hasUnitScale, sizeW: _sizeW, sizeH: _sizeH, keepAspect: _keepAspect, axisLimits, dotfactor: _dotfactor, currentlight } = result;
  const keepAspect = _keepAspect !== false;
  let sizeW = _sizeW, sizeH = _sizeH;
  const isAutoScaled = !hasUnitScale && (_sizeW <= 0) && (_sizeH <= 0);
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

  // Collect clip commands: in Asymptote, clip() constrains the bounding box
  // to the intersection of all clip regions.
  let clipMinX = -Infinity, clipMinY = -Infinity, clipMaxX = Infinity, clipMaxY = Infinity;
  let hasClip = false;
  for (const dc of drawCommands) {
    if (dc.cmd === 'clip' && dc.path && dc.path.segs.length > 0) {
      hasClip = true;
      let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
      for (const seg of dc.path.segs) {
        for (const p of [seg.p0, seg.p3]) {
          if (p.x < cMinX) cMinX = p.x;
          if (p.x > cMaxX) cMaxX = p.x;
          if (p.y < cMinY) cMinY = p.y;
          if (p.y > cMaxY) cMaxY = p.y;
        }
      }
      // Intersect with any previous clip regions
      clipMinX = Math.max(clipMinX, cMinX);
      clipMinY = Math.max(clipMinY, cMinY);
      clipMaxX = Math.min(clipMaxX, cMaxX);
      clipMaxY = Math.min(clipMaxY, cMaxY);
    }
  }

  // Compute bounding box from all draw commands
  for (const dc of drawCommands) {
    if (dc.cmd === 'dot') {
      expandBBox(dc.pos.x, dc.pos.y);
    } else if (dc.cmd === 'label') {
      // Include all labels in geometry bbox, even invisible ones
      // (matches Asymptote behavior for unitsize scaling)
      expandBBox(dc.pos.x, dc.pos.y);
      // Estimate text extent in user coordinates for bbox expansion
      // We don't know pxPerUnit yet, so approximate with a fraction of bbox size
      // This will be refined after pxPerUnit is computed below
    } else if (dc.cmd === 'image' && dc.graphic) {
      // Expand bbox to include image extent (position ± half display size)
      const imgSize = computeGraphicDisplaySize(dc.graphic, unitScale, hasUnitScale);
      const hw = imgSize.w_user / 2, hh = imgSize.h_user / 2;
      expandBBox(dc.pos.x - hw, dc.pos.y - hh);
      expandBBox(dc.pos.x + hw, dc.pos.y + hh);
    } else if (dc.cmd === 'marker') {
      // Marker is in bp units — only include anchor position in bbox (marker size is tiny)
      expandBBox(dc.pos.x, dc.pos.y);
    } else if (dc.cmd === 'clip') {
      // clip commands don't contribute to bbox — they constrain it (handled below)
      continue;
    } else if (dc.path) {
      // Skip white fills for bbox: fill(box(...), white) is a background erase
      // that shouldn't define the bounding box (matches Asymptote behavior)
      if (dc.cmd === 'fill' && dc.pen && dc.pen.r >= 0.99 && dc.pen.g >= 0.99 && dc.pen.b >= 0.99) {
        continue;
      }
      // Tick marks have fixed physical size — they should not inflate the geometry bbox.
      // In real Asymptote, tick sizes are in bp (physical points), not user coordinates.
      if (dc._isTickMark) continue;
      // Extended lines (drawline) don't contribute to bbox — they get clipped
      // to the final bbox after scaling is determined.
      if (dc._extendedLine) continue;
      if (dc._subpicClipRect) {
        // Paths clipped to a sub-picture crop region should not expand the bbox
        // beyond that region — save bbox state, expand, then clamp contribution.
        const cr = dc._subpicClipRect;
        const savedMaxX = maxX, savedMaxY = maxY, savedMinX = minX, savedMinY = minY;
        if (dc.path._singlePoint) expandBBox(dc.path._singlePoint.x, dc.path._singlePoint.y);
        for (const seg of dc.path.segs) expandBezierBBox(seg);
        maxX = Math.max(savedMaxX, Math.min(maxX, cr.xmax));
        maxY = Math.max(savedMaxY, Math.min(maxY, cr.ymax));
        minX = Math.min(savedMinX, Math.max(minX, cr.xmin));
        minY = Math.min(savedMinY, Math.max(minY, cr.ymin));
      } else {
        if (dc.path._singlePoint) {
          expandBBox(dc.path._singlePoint.x, dc.path._singlePoint.y);
        }
        for (const seg of dc.path.segs) expandBezierBBox(seg);
      }
    }
  }

  // Constrain bbox to clip region (Asymptote clip() restricts the bounding box)
  if (hasClip) {
    minX = Math.max(minX, clipMinX);
    minY = Math.max(minY, clipMinY);
    maxX = Math.min(maxX, clipMaxX);
    maxY = Math.min(maxY, clipMaxY);
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

  // Add padding for stroke overshoot
  if (!isFinite(minX)) { minX=0; minY=0; maxX=1; maxY=1; }

  // Save geometry-only bbox before label expansion (and before padding).
  // In real Asymptote, size() scales geometry to fit the requested dimensions;
  // labels are placed at absolute point sizes and don't shrink the geometry.
  const geoBboxW = (maxX - minX) || 1;
  const geoBboxH = (maxY - minY) || 1;

  // Padding in bp, converted to user coordinates.  Real Asymptote expands the
  // bbox by each path's pen width; we approximate with a small fixed pad (1 bp
  // on each side) so the value doesn't depend on user-coordinate scale.
  // In IgnoreAspect mode, x and y scales can differ dramatically, so use separate
  // per-axis padding to avoid catastrophically inflating the smaller-range axis.
  let padX, padY;
  if (hasUnitScale) {
    padX = padY = 0.5 / unitScale;
  } else if (!keepAspect && sizeW > 0 && sizeH > 0) {
    padX = 0.5 / (sizeW / geoBboxW);
    padY = 0.5 / (sizeH / geoBboxH);
  } else {
    const roughPxPerUnitForPad = sizeW > 0 ? sizeW / geoBboxW
      : (sizeH > 0 ? sizeH / geoBboxH : 200 / geoBboxW);
    padX = padY = 0.5 / roughPxPerUnitForPad;
  }
  minX -= padX; minY -= padY; maxX += padX; maxY += padY;

  // Expand bbox for labels so text doesn't get clipped.
  // Estimate label extent in user coordinates.  We iterate because the scale
  // (pxPerUnit) depends on the bbox, and labels expand the bbox.  Two passes
  // suffice: the first expands coarsely, the second refines with the updated bbox.
  const geoMinX = minX, geoMinY = minY, geoMaxX = maxX, geoMaxY = maxY;
  const labelInfoBp = [];  // Collect label bp-space info for iterative scale solver
  for (let labelPass = 0; labelPass < 2; labelPass++) {
    // Compute the rough pxPerUnit from current bbox (mirrors the final scale logic)
    const curBboxW = (maxX - minX) || 1;
    const curBboxH = (maxY - minY) || 1;
    let roughPxPerUnit, roughPxPerUnitX, roughPxPerUnitY;
    if (hasUnitScale) {
      roughPxPerUnit = roughPxPerUnitX = roughPxPerUnitY = unitScale;
    } else if (sizeW > 0 || sizeH > 0) {
      // Use geometry-only bbox for scale estimation, matching the final
      // pxPerUnit logic (labels don't shrink geometry in real Asymptote).
      const geoW = (geoMaxX - geoMinX) || 1;
      const geoH = (geoMaxY - geoMinY) || 1;
      const tW = sizeW > 0 ? sizeW : Infinity;
      const tH = sizeH > 0 ? sizeH : Infinity;
      roughPxPerUnit = Math.min(tW / geoW, tH / geoH);
      roughPxPerUnitX = keepAspect ? roughPxPerUnit : (sizeW > 0 ? sizeW / geoW : roughPxPerUnit);
      roughPxPerUnitY = keepAspect ? roughPxPerUnit : (sizeH > 0 ? sizeH / geoH : roughPxPerUnit);
    } else {
      // No size/unitsize: default size(150) — scale by the binding dimension
      const geoW = (geoMaxX - geoMinX) || 1;
      const geoH = (geoMaxY - geoMinY) || 1;
      roughPxPerUnit = Math.min(150 / geoW, 150 / geoH);
      roughPxPerUnitX = roughPxPerUnitY = roughPxPerUnit;
    }

    // Reset bbox to geometry-only extents before re-expanding with labels
    if (labelPass > 0) {
      minX = geoMinX; minY = geoMinY; maxX = geoMaxX; maxY = geoMaxY;
    }

    // Auto-scaled diagrams (no size/unitsize) need wider char width estimate
    // to match Asymptote's shipout(bbox()) sizing where labels dominate the bbox.
    const autoScaled = !hasUnitScale && sizeW <= 0 && sizeH <= 0;

    for (const dc of drawCommands) {
      if (dc.cmd === 'label' || dc.cmd === 'dot') {
        const pos = dc.pos || dc;
        if (!pos || pos.x === undefined) continue;
        // Skip invisible labels (opacity 0) from bbox expansion
        if (dc.pen && dc.pen.opacity === 0) continue;
        let fontSize = (dc.pen && dc.pen.fontsize) || 10;
        const text = dc.text || dc.label || '';
        // For multiline labels (minipage), stripLaTeX collapses whitespace including \n.
        // Split on \n first, strip each line, use longest for width estimation.
        const rawLines = typeof text === 'string' ? text.split('\n') : [''];
        const cleanLines = rawLines.map(l => stripLaTeX(l));
        const cleanText = cleanLines.join(' ');

        // Account for label transform (scale/rotate) in bbox estimation
        let ltScale = 1, ltAngle = 0;
        if (dc.labelTransform) {
          const lt = dc.labelTransform;
          ltScale = Math.sqrt(lt.b * lt.b + lt.e * lt.e);
          if (ltScale > 0 && Math.abs(ltScale - 1) > 0.01) fontSize *= ltScale;
          ltAngle = Math.atan2(lt.e, lt.b) * 180 / Math.PI;
        }

        // Character width estimate for bbox: for size()-constrained diagrams,
        // use a tight glyph-bbox estimate (0.288 em) that keeps geometry scale
        // close to real Asymptote.  For auto-scaled diagrams, use the TeX
        // advance width (~0.75 em) so label-dominated layouts match Asymptote.
        const charWidthBp = fontSize * (autoScaled ? 0.75 : 0.48 * 0.6);
        const charWidthUser = charWidthBp / roughPxPerUnitX;
        // For labels with fractions, estimate wider width
        const rawLabel = text;
        const hasFrac = /\\frac/.test(rawLabel);
        // Use longest line's length for width estimation (multiline minipage labels)
        const maxLineLen = cleanLines.reduce((m, l) => Math.max(m, l.length), 0);
        const numLines = cleanLines.length;
        const effectiveLen = hasFrac ? maxLineLen * 1.6 : maxLineLen;
        let textWidthUser = effectiveLen * charWidthUser;
        // Height estimate: for size()-constrained, use fuller capRatio; for auto-scaled, fuller height
        const heightFactor = autoScaled ? 0.7 : 0.65;
        let textHeightUser = numLines * (hasFrac ? fontSize * heightFactor * 1.5 : fontSize * heightFactor) / roughPxPerUnitY;

        // For rotated labels, compute the axis-aligned bounding box of the rotated text.
        // Use the exact formula for any angle rather than just swapping at 90°.
        if (Math.abs(ltAngle) > 0.5) {
          // Original dimensions in bp (before dividing by axis scale)
          const textWidthBp = effectiveLen * charWidthBp;
          const textHeightBp = numLines * (hasFrac ? fontSize * heightFactor * 1.5 : fontSize * heightFactor);
          const cosA = Math.abs(Math.cos(ltAngle * Math.PI / 180));
          const sinA = Math.abs(Math.sin(ltAngle * Math.PI / 180));
          // Rotated bbox: visual x-extent and y-extent
          textWidthUser = (textWidthBp * cosA + textHeightBp * sinA) / roughPxPerUnitX;
          textHeightUser = (textWidthBp * sinA + textHeightBp * cosA) / roughPxPerUnitY;
        }

        let dx = 0, dy = 0;
        if (dc.align) {
          const ax = dc.align.x, ay = dc.align.y;
          const marginX = 0.40 * fontSize / roughPxPerUnitX;
          const marginY = 0.40 * fontSize / roughPxPerUnitY;
          // Match Asymptote drawlabel.cc: z = align * 0.5 (no L∞ normalisation)
          const ax_n = ax * 0.5;
          const ay_n = ay * 0.5;
          dx = ax_n * textWidthUser + ax * marginX;
          dy = ay_n * textHeightUser + ay * marginY;   // Asymptote y-up, no inversion
        }
        // Apply screen-space offsets (used by axis labels to autoshift past tick labels).
        // screenDx/screenDy are in bp; convert to user coords using rough scale.
        if (dc.screenDx) dx += dc.screenDx / roughPxPerUnitX;
        // screenDy is an SVG-y offset (positive = down). In user coords y is inverted.
        if (dc.screenDy) dy -= dc.screenDy / roughPxPerUnitY;
        // Expand bbox to include estimated text bounds
        const cx = pos.x + dx;
        const cy = pos.y + dy;

        expandBBox(cx - textWidthUser/2, cy - textHeightUser/2);
        expandBBox(cx + textWidthUser/2, cy + textHeightUser/2);

        // On first pass, collect bp-space info for the iterative scale solver
        if (labelPass === 0) {
          // When clip() is active, items whose anchor is outside the clip region
          // are invisible and must not drive scale computation or bbox expansion.
          if (hasClip && (pos.x < clipMinX || pos.x > clipMaxX || pos.y < clipMinY || pos.y > clipMaxY)) {
            // skip — outside clip region, will not appear in output
          } else {
            // Compute bp-space dimensions (before rotation swap)
            let lWidthBp = effectiveLen * charWidthBp;
            let lHeightBp = numLines * (hasFrac ? fontSize * heightFactor * 1.5 : fontSize * heightFactor);
            // For rotated labels, use the rotated bounding box dimensions
            if (Math.abs(ltAngle) > 0.5) {
              const cosA = Math.abs(Math.cos(ltAngle * Math.PI / 180));
              const sinA = Math.abs(Math.sin(ltAngle * Math.PI / 180));
              const rW = lWidthBp * cosA + lHeightBp * sinA;
              const rH = lWidthBp * sinA + lHeightBp * cosA;
              lWidthBp = rW;
              lHeightBp = rH;
            }
            let alignOffsetXBp = dc.align ? (dc.align.x * 0.5 * lWidthBp + dc.align.x * 0.40 * fontSize) : 0;
            let alignOffsetYBp = dc.align ? (dc.align.y * 0.5 * lHeightBp + dc.align.y * 0.40 * fontSize) : 0;
            // screenDx/screenDy (in bp) are applied on top of alignment-driven offset
            if (dc.screenDx) alignOffsetXBp += dc.screenDx;
            if (dc.screenDy) alignOffsetYBp -= dc.screenDy;  // SVG y-down → Asymptote y-up
            labelInfoBp.push({
              posX: pos.x, posY: pos.y,
              widthBp: lWidthBp,
              heightBp: lHeightBp,
              alignOffsetXBp,
              alignOffsetYBp,
              _text: text,
              _fontSize: fontSize,
              _ltAngle: ltAngle
            });
          }
        }
      }
    }
  }

  // Re-constrain bbox after label expansion: clip() must not be expanded by labels
  if (hasClip) {
    minX = Math.max(minX, clipMinX - pad);
    minY = Math.max(minY, clipMinY - pad);
    maxX = Math.min(maxX, clipMaxX + pad);
    maxY = Math.min(maxY, clipMaxY + pad);
  }

  // GIF mode: override bounds with union bounds across all frames so that
  // every frame uses the same coordinate system and points don't drift.
  if (opts.forcedBounds) {
    minX = opts.forcedBounds.minX;
    minY = opts.forcedBounds.minY;
    maxX = opts.forcedBounds.maxX;
    maxY = opts.forcedBounds.maxY;
  }

  const warnings = [];

  // Determine scale
  const bboxW = maxX - minX, bboxH = maxY - minY;
  let pxPerUnit, pxPerUnitX, pxPerUnitY;
  if (hasUnitScale) {
    // unitsize() was called: user coords → bp directly (labels just expand output)
    pxPerUnit = pxPerUnitX = pxPerUnitY = unitScale;
    // When size() is also explicitly set, use it to govern the geometry scale.
    // Real Asymptote/TeXeR scales 3D diagrams (and others with both set) to the
    // requested size() regardless of unitsize(), so size() acts as an override.
    if (sizeW > 0 || sizeH > 0) {
      const _sw = sizeW > 0 ? sizeW : Infinity;
      const _sh = sizeH > 0 ? sizeH : Infinity;
      const _gW = (geoMaxX - geoMinX) || 1;
      const _gH = (geoMaxY - geoMinY) || 1;
      pxPerUnit = pxPerUnitX = pxPerUnitY = Math.min(_sw / _gW, _sh / _gH);
    }
    // When unitsize() makes cells much smaller than the default label font size
    // (10bp), labels overwhelm the geometry.  Real Asymptote/TeXeR keeps labels
    // at truesize (fixed bp) while the geometry scales to fit the output — so
    // small unitsize diagrams get their geometry boosted to a reasonable size.
    // We mimic this by ensuring pxPerUnit is at least large enough to fit the
    // geometry within the default output size (200bp, same as the no-unitsize
    // fallback).  This uses the geometry-only bbox (before label expansion) so
    // labels remain truesize via bpCSSPixel.
    // However, when labels expand the bbox significantly beyond the geometry
    // (i.e. the label-expanded bbox is already large enough), skip the boost
    // to match real Asymptote behaviour where unitsize is the exact scale.
    const geoW = (geoMaxX - geoMinX) || 1;
    const geoH = (geoMaxY - geoMinY) || 1;
    const fullW = (maxX - minX) || 1;
    const fullH = (maxY - minY) || 1;
    const defaultSize = 200;  // match no-unitsize default
    // When boosting unitsize, preserve the natural aspect ratio
    const naturalW = geoW * unitScale;
    const naturalH = geoH * unitScale;
    // Use label-expanded bbox to decide whether boost is needed: if the full
    // bbox (with labels) already yields a reasonable output size at the natural
    // unitsize, don't boost — the labels already provide adequate visual content.
    const fullNatW = fullW * unitScale;
    const fullNatH = fullH * unitScale;
    // For very small unitsize (< 10 bp/unit), use a higher threshold to ensure
    // diagrams with dense labels/arrows remain readable. For normal unitsize,
    // only boost when truly invisible (< 50bp).
    const minReasonable = unitScale < 10 ? 100 : 50;
    if (naturalW < defaultSize && naturalH < defaultSize
        && Math.max(fullNatW, fullNatH) < minReasonable) {
      // Scale up while maintaining aspect ratio
      const boostScale = Math.min(defaultSize / naturalW, defaultSize / naturalH);
      pxPerUnit = pxPerUnitX = pxPerUnitY = unitScale * boostScale;
    }
  } else if (sizeW > 0 || sizeH > 0) {
    // size() without unitsize(): scale geometry to fit the requested size.
    // Real Asymptote constrains geometry scale via size(); labels are placed at
    // absolute point sizes and simply make the output bigger.  Using the
    // geometry-only bbox (before label expansion) for the scale denominator
    // matches that behaviour — labels are allowed to extend beyond the size()
    // box (rendered via overflow:visible).
    const targetW = sizeW > 0 ? sizeW : Infinity;
    const targetH = sizeH > 0 ? sizeH : Infinity;
    const scaleRefW = (geoMaxX - geoMinX) || 1;
    const scaleRefH = (geoMaxY - geoMinY) || 1;
    pxPerUnit = Math.min(targetW / scaleRefW, targetH / scaleRefH);
    if (!keepAspect && sizeW > 0 && sizeH > 0) {
      // IgnoreAspect: independent scaling per axis
      pxPerUnitX = sizeW / scaleRefW;
      pxPerUnitY = sizeH / scaleRefH;
    } else {
      pxPerUnitX = pxPerUnitY = pxPerUnit;
    }
  } else {
    // No unitsize/size: mimic AoPS TeXeR behavior.
    // TeXeR's Asymptote default (no size command) is equivalent to size(150),
    // measured empirically: all no-size diagrams produce 504 natural px wide
    // (= 252 CSS px = 150 bp × 240 DPI / 72 / 2).
    const defaultSize = 150;
    const targetW = defaultSize;
    const targetH = defaultSize;
    const scaleRefW2 = (geoMaxX - geoMinX) || 1;
    const scaleRefH2 = (geoMaxY - geoMinY) || 1;
    // Scale to fit the larger dimension to defaultSize, maintaining aspect ratio
    const maxDim = Math.max(scaleRefW2, scaleRefH2);
    pxPerUnit = defaultSize / maxDim;
    pxPerUnitX = pxPerUnitY = pxPerUnit;
    sizeW = defaultSize;
    sizeH = defaultSize;
    warnings.push('auto-scaled');
  }

  // Iterative scale solver: reduce pxPerUnit so total output
  // (geometry + truesize labels) fits within size constraint.
  // Real Asymptote does this; labels are truesize and don't scale with geometry.
  let labelShrinkFactor = 1;
  if ((!hasUnitScale && !isAutoScaled || hasUnitScale && (sizeW > 0 || sizeH > 0)) && labelInfoBp.length > 0) {
    const tgtW = sizeW > 0 ? sizeW : Infinity;
    const tgtH = sizeH > 0 ? sizeH : Infinity;

    // Save pre-solver scale for the label-dominated fallback below.
    const preSolverPxPerUnit = pxPerUnit;
    const preSolverPxPerUnitX = pxPerUnitX;
    const preSolverPxPerUnitY = pxPerUnitY;
    let finalExceed = 1;

    for (let iter = 0; iter < 5; iter++) {
      let bpMinX = geoMinX * pxPerUnitX;
      let bpMaxX = geoMaxX * pxPerUnitX;
      let bpMinY = geoMinY * pxPerUnitY;
      let bpMaxY = geoMaxY * pxPerUnitY;

      for (const li of labelInfoBp) {
        const cx = li.posX * pxPerUnitX + li.alignOffsetXBp;
        const cy = li.posY * pxPerUnitY + li.alignOffsetYBp;
        bpMinX = Math.min(bpMinX, cx - li.widthBp / 2);
        bpMaxX = Math.max(bpMaxX, cx + li.widthBp / 2);
        bpMinY = Math.min(bpMinY, cy - li.heightBp / 2);
        bpMaxY = Math.max(bpMaxY, cy + li.heightBp / 2);
      }

      const totalW = bpMaxX - bpMinX;
      const totalH = bpMaxY - bpMinY;
      const exceedW = tgtW < Infinity ? totalW / tgtW : 0;
      const exceedH = tgtH < Infinity ? totalH / tgtH : 0;
      const exceed = Math.max(exceedW, exceedH);
      finalExceed = exceed;

      if (exceed <= 1.005) break; // fits within tolerance

      // Scale down geometry (labels stay fixed bp)
      if (keepAspect || pxPerUnitX === pxPerUnitY) {
        pxPerUnit = pxPerUnitX = pxPerUnitY = pxPerUnit / exceed;
      } else {
        // IgnoreAspect: scale each axis independently
        if (exceedW > 1) pxPerUnitX /= exceedW;
        if (exceedH > 1) pxPerUnitY /= exceedH;
        pxPerUnit = Math.min(pxPerUnitX, pxPerUnitY);
      }
    }

    // Post-solver MathJax recheck: the heuristic (charWidthBp = fontSize * 0.288)
    // under-estimates wide sans-serif / bold text by up to 2.5×.  For svg-native
    // mode, actually measure each label through MathJax and recompute finalExceed
    // so the label-dominated fallback below triggers when needed (e.g. 80pt
    // \textsf{NOON} labels that are 216 bp wide but estimated at 92 bp).
    if (finalExceed <= 1.005 && opts && opts.labelOutput === 'svg-native'
        && typeof _mjxMeasureBp === 'function' && (tgtW < Infinity || tgtH < Infinity)) {
      let bpMinX = geoMinX * pxPerUnitX;
      let bpMaxX = geoMaxX * pxPerUnitX;
      let bpMinY = geoMinY * pxPerUnitY;
      let bpMaxY = geoMaxY * pxPerUnitY;
      let anyMeasured = false;
      for (const li of labelInfoBp) {
        let wBp = li.widthBp, hBp = li.heightBp;
        try {
          const m = _mjxMeasureBp(li._text, li._fontSize);
          if (m && m.wBp > 0) {
            let mw = m.wBp, mh = m.hBp;
            if (Math.abs(li._ltAngle) > 0.5) {
              const cosA = Math.abs(Math.cos(li._ltAngle * Math.PI / 180));
              const sinA = Math.abs(Math.sin(li._ltAngle * Math.PI / 180));
              const rW = mw * cosA + mh * sinA;
              const rH = mw * sinA + mh * cosA;
              mw = rW; mh = rH;
            }
            wBp = mw; hBp = mh;
            anyMeasured = true;
          }
        } catch (e) { /* ignore measurement errors */ }
        const cx = li.posX * pxPerUnitX + li.alignOffsetXBp;
        const cy = li.posY * pxPerUnitY + li.alignOffsetYBp;
        bpMinX = Math.min(bpMinX, cx - wBp / 2);
        bpMaxX = Math.max(bpMaxX, cx + wBp / 2);
        bpMinY = Math.min(bpMinY, cy - hBp / 2);
        bpMaxY = Math.max(bpMaxY, cy + hBp / 2);
      }
      if (anyMeasured) {
        const totalW = bpMaxX - bpMinX;
        const totalH = bpMaxY - bpMinY;
        const exceedW = tgtW < Infinity ? totalW / tgtW : 0;
        const exceedH = tgtH < Infinity ? totalH / tgtH : 0;
        const mjxExceed = Math.max(exceedW, exceedH);
        if (mjxExceed > 1.005) {
          // Overwrite heuristic widths with MathJax-measured widths so the
          // fallback below uses accurate dimensions for uniform scaling.
          for (const li of labelInfoBp) {
            try {
              const m = _mjxMeasureBp(li._text, li._fontSize);
              if (m && m.wBp > 0) {
                let mw = m.wBp, mh = m.hBp;
                if (Math.abs(li._ltAngle) > 0.5) {
                  const cosA = Math.abs(Math.cos(li._ltAngle * Math.PI / 180));
                  const sinA = Math.abs(Math.sin(li._ltAngle * Math.PI / 180));
                  const rW = mw * cosA + mh * sinA;
                  const rH = mw * sinA + mh * cosA;
                  mw = rW; mh = rH;
                }
                li.widthBp = mw;
                li.heightBp = mh;
              }
            } catch (e) { /* ignore */ }
          }
          finalExceed = mjxExceed;
        }
      }
    }

    // Label-dominated layout: if labels alone exceed size() target, the
    // iterative solver cannot converge (shrinking geometry doesn't reduce
    // total width when label width dominates). Real Asymptote behavior is
    // to keep labels at their natural truesize and let them overflow beyond
    // the size() constraint — the output is simply larger than size().
    // Reset pxPerUnit to pre-solver value so geometry fits size(), and let
    // labels overflow (via SVG overflow:visible). Do NOT scale labels.
    if (finalExceed > 1.005) {
      pxPerUnit = preSolverPxPerUnit;
      pxPerUnitX = preSolverPxPerUnitX;
      pxPerUnitY = preSolverPxPerUnitY;
      // labelShrinkFactor stays at 1 — labels are not scaled

      // When labels would visibly overlap at current pxPerUnit (both
      // horizontally and vertically in user space), Asymptote/TeXeR
      // scales pxPerUnit up so the labels clear. Detect vertical overlap
      // between labels that share x-range and boost pxPerUnit uniformly
      // (keepAspect) or Y-axis (ignoreAspect) to separate them.
      if (labelInfoBp.length >= 2) {
        let needsBoost = 1;
        for (let i = 0; i < labelInfoBp.length; i++) {
          for (let j = i+1; j < labelInfoBp.length; j++) {
            const a = labelInfoBp[i], b = labelInfoBp[j];
            const dy = Math.abs(a.posY - b.posY);
            if (dy < 0.001) continue;
            // Require x-ranges to overlap substantially (>50% of smaller label width)
            const aw = a.widthBp, bw = b.widthBp;
            const halfAW = aw / 2 / pxPerUnitX, halfBW = bw / 2 / pxPerUnitX;
            const ax = a.posX, bx = b.posX;
            const overlapX = Math.min(ax+halfAW, bx+halfBW) - Math.max(ax-halfAW, bx-halfBW);
            const minW = Math.min(aw, bw) / pxPerUnitX;
            if (overlapX <= 0.5 * minW) continue;
            // Current Y-overlap (positive means overlapping in user coords)
            const halfAH = a.heightBp / 2 / pxPerUnitY;
            const halfBH = b.heightBp / 2 / pxPerUnitY;
            const yOverlap = (halfAH + halfBH) - dy;
            if (yOverlap <= 0) continue; // already clear
            // Required pxPerUnit so labels clear with a visible gap.
            // Empirically matches TeXeR's spacing for label-dominated
            // layouts: center-to-center distance ≈ 1.5× label height.
            const avgH = (a.heightBp + b.heightBp) / 2;
            const requiredP = 1.5 * avgH / dy;
            const boost = requiredP / pxPerUnitY;
            if (boost > needsBoost) needsBoost = boost;
          }
        }
        if (needsBoost > 1.005) {
          if (keepAspect) {
            pxPerUnit *= needsBoost;
            pxPerUnitX *= needsBoost;
            pxPerUnitY *= needsBoost;
          } else {
            pxPerUnitY *= needsBoost;
          }
        }
      }
    }
  }

  // Recompute label-expanded bbox at final scale so naturalW/H is correct.
  // For autoScaled (no size/unitsize) diagrams, skip: the scale is set by the
  // geometry only, and labels are allowed to overflow (matching real Asymptote).
  if ((!hasUnitScale && !isAutoScaled || hasUnitScale && (sizeW > 0 || sizeH > 0)) && labelInfoBp.length > 0) {
    minX = geoMinX; maxX = geoMaxX;
    minY = geoMinY; maxY = geoMaxY;
    for (const li of labelInfoBp) {
      const cx = li.posX + li.alignOffsetXBp / pxPerUnitX;
      const cy = li.posY + li.alignOffsetYBp / pxPerUnitY;
      const hw = li.widthBp / (2 * pxPerUnitX);
      const hh = li.heightBp / (2 * pxPerUnitY);
      minX = Math.min(minX, cx - hw);
      maxX = Math.max(maxX, cx + hw);
      minY = Math.min(minY, cy - hh);
      maxY = Math.max(maxY, cy + hh);
    }
  }

  // Re-constrain bbox after label re-expansion: clip() bounds must not be exceeded
  // (labelInfoBp already excludes out-of-clip items, but re-apply as a safety net)
  if (hasClip) {
    minX = Math.max(minX, clipMinX - pad);
    minY = Math.max(minY, clipMinY - pad);
    maxX = Math.min(maxX, clipMaxX + pad);
    maxY = Math.min(maxY, clipMaxY + pad);
  }

  // GIF mode: override pxPerUnit with a fixed value so scale is consistent across all frames
  if (opts.forcedPxPerUnit) {
    pxPerUnit = pxPerUnitX = pxPerUnitY = opts.forcedPxPerUnit;
  }

  // For autoScaled (no size/unitsize): the 2-pass label bbox expansion above
  // expanded minX/maxX/minY/maxY beyond the geometry, but those expansions
  // should not affect naturalW/H — the scale is geometry-only for autoScaled.
  // Reset to the geometry bbox before computing natural dimensions.
  if (isAutoScaled) {
    minX = geoMinX; maxX = geoMaxX; minY = geoMinY; maxY = geoMaxY;
  }

  // Rewrite extended-line (drawline) paths to clip to the final bbox.
  // This is done in-place on the drawCommands so the renderer sees
  // properly clipped segments that fit within the picture frame.
  {
    const bxmin = minX, bxmax = maxX, bymin = minY, bymax = maxY;
    const bw = bxmax - bxmin, bh = bymax - bymin;
    // Extend a small margin past bbox so lines visibly reach edges.
    const marginX = bw * 0.02, marginY = bh * 0.02;
    for (const dc of drawCommands) {
      if (!dc._extendedLine) continue;
      const L = dc._extendedLine;
      const dx = L.bx - L.ax, dy = L.by - L.ay;
      // Parametric line: P(t) = A + t*(B-A).  Find intersections with the
      // expanded bbox rectangle.  Use Liang-Barsky style clipping.
      const xmin = bxmin - marginX, xmax = bxmax + marginX;
      const ymin = bymin - marginY, ymax = bymax + marginY;
      const ts = [];
      if (Math.abs(dx) > 1e-12) {
        ts.push((xmin - L.ax) / dx);
        ts.push((xmax - L.ax) / dx);
      }
      if (Math.abs(dy) > 1e-12) {
        ts.push((ymin - L.ay) / dy);
        ts.push((ymax - L.ay) / dy);
      }
      if (ts.length < 2) continue;
      // Keep only t values where the point is inside the rectangle
      const inside = [];
      for (const t of ts) {
        const px = L.ax + t * dx, py = L.ay + t * dy;
        if (px >= xmin - 1e-9 && px <= xmax + 1e-9 &&
            py >= ymin - 1e-9 && py <= ymax + 1e-9) {
          inside.push(t);
        }
      }
      if (inside.length < 2) continue;
      inside.sort((a, b) => a - b);
      const t0 = inside[0], t1 = inside[inside.length - 1];
      if (t1 - t0 < 1e-9) continue;
      const p0 = makePair(L.ax + t0 * dx, L.ay + t0 * dy);
      const p1 = makePair(L.ax + t1 * dx, L.ay + t1 * dy);
      dc.path = makePath([lineSegment(p0, p1)], false);
    }
  }

  const naturalW = (maxX - minX) * pxPerUnitX;
  const naturalH = (maxY - minY) * pxPerUnitY;

  // Apply explicit size() if given (sizes are in bp = 1/72 inch).
  // When only one dimension is constrained, scale the other to maintain
  // the natural (label-expanded) aspect ratio — otherwise the display
  // distorts because the constrained axis uses sizeW/H while the
  // unconstrained one uses the full label-expanded natural size.
  let svgW = naturalW, svgH = naturalH;
  if (sizeW > 0 && sizeH > 0) {
    if (keepAspect) {
      // size(w,h) with keepAspect means "fit within w×h box, maintaining aspect ratio".
      // Use the natural (content-fitting) dimensions — the binding constraint dimension
      // equals the size() value, the other is smaller to preserve aspect ratio.
      svgW = naturalW;
      svgH = naturalH;
    } else {
      // IgnoreAspect: naturalW/H already equal sizeW/H (independent scaling)
      svgW = naturalW;
      svgH = naturalH;
    }
  } else if (sizeW > 0) {
    // Use natural dimensions (geometry-scaled) so that preserveAspectRatio
    // doesn't re-shrink the geometry to fit sizeW.  Labels extend the
    // natural size beyond sizeW, which is correct — real Asymptote does
    // the same (labels make the output bigger than size()).
    svgW = naturalW;
    svgH = naturalH;
  } else if (sizeH > 0) {
    svgW = naturalW;
    svgH = naturalH;
  }

  // Note: the +1bp pen padding that was here has been removed — the iterative
  // scale solver now accounts for the full output including pen overshoot via
  // the geometry bbox (which already includes the `pad` variable).

  // Convert bp → CSS display pixels.  Asymptote sizes are in PostScript points
  // (1 bp = 1/72 in).  The AoPS TeXeR rasterizes at 240 DPI and displays at
  // half resolution (width = naturalWidth/2), giving an effective 120 DPI for
  // web display: 240/72/2 = 5/3 ≈ 1.6667 CSS px per bp.
  const bpToCSSPx = 5/3;
  svgW *= bpToCSSPx;
  svgH *= bpToCSSPx;

  // Store unshrunk dimensions for PNG export (before container shrink-to-fit)
  let intrinsicW = svgW, intrinsicH = svgH;

  // If container dimensions provided, shrink oversized diagrams to fit
  let displayPercent = 100;
  const containerW = opts.containerW || 0;
  const containerH = opts.containerH || 0;
  if (containerW > 0 && containerH > 0) {
    const scaleX = containerW / svgW;
    const scaleY = containerH / svgH;
    // Only shrink oversized diagrams — small diagrams keep their natural size
    // so that unitsize/size produce images matching real Asymptote/TeXeR output.
    if (scaleX < 1 || scaleY < 1) {
      const fitScale = Math.min(scaleX, scaleY);
      displayPercent = Math.round(fitScale * 100);
      svgW *= fitScale;
      svgH *= fitScale;
      // We don't change pxPerUnit or viewBox — we just set SVG width/height
      // and let the browser scale via viewBox
    }
  }

  // Compute viewBox (in intrinsic coordinates, before any display shrink)
  let viewW = naturalW;
  let viewH = naturalH;

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
    const cx1 = (axisLimits.xmin - minX) * pxPerUnitX;
    const cy1 = (maxY - axisLimits.ymax) * pxPerUnitY;
    const cw = (axisLimits.xmax - axisLimits.xmin) * pxPerUnitX;
    const ch = (axisLimits.ymax - axisLimits.ymin) * pxPerUnitY;
    elements.push(`<defs><clipPath id="${cropClipId}"><rect x="${fmt(cx1)}" y="${fmt(cy1)}" width="${fmt(cw)}" height="${fmt(ch)}"/></clipPath></defs>`);
  }

  // Per-subpicture crop clips: collect unique clip IDs from draw commands
  // and generate a <defs><clipPath> for each.
  const subpicClipIds = new Set();
  for (const dc of drawCommands) {
    if (dc._subpicClipId && !subpicClipIds.has(dc._subpicClipId)) {
      subpicClipIds.add(dc._subpicClipId);
      const r = dc._subpicClipRect;
      const cx1 = (r.xmin - minX) * pxPerUnitX;
      const cy1 = (maxY - r.ymax) * pxPerUnitY;
      const cw  = (r.xmax - r.xmin) * pxPerUnitX;
      const ch  = (r.ymax - r.ymin) * pxPerUnitY;
      elements.push(`<defs><clipPath id="${dc._subpicClipId}"><rect x="${fmt(cx1)}" y="${fmt(cy1)}" width="${fmt(cw)}" height="${fmt(ch)}"/></clipPath></defs>`);
    }
  }

  // Asymptote clip(): create SVG clipPath from clip commands.
  // Unlike crop clipping (which excludes labels), clip() clips everything.
  let userClipId = null;
  if (hasClip) {
    userClipId = 'user-clip';
    let clipDefs = '<defs><clipPath id="user-clip">';
    for (const dc of drawCommands) {
      if (dc.cmd === 'clip' && dc.path && dc.path.segs.length > 0) {
        clipDefs += `<path d="${pathToD(dc.path, minX, maxY, pxPerUnitX, pxPerUnitY)}"/>`;
      }
    }
    clipDefs += '</clipPath></defs>';
    elements.push(clipDefs);
  }

  // Scale factor: how many viewBox units = 1 CSS pixel at intrinsic size.
  // We use intrinsicW/H (before container fit-scaling) so that stroke widths,
  // dot radii, and font sizes are independent of the display container.  The
  // browser's viewBox→display mapping scales everything uniformly, so strokes
  // look correct at any display size.  For rasterization (librsvg/sharp) the
  // intrinsic dimensions determine the actual rendered stroke weight.
  // With keepAspect=false the non-uniform scaling is baked into coordinates via
  // pxPerUnitX/Y, so viewBox matches svgW/svgH and cssPixel ≈ 1.
  const cssPixel = keepAspect
    ? Math.max(viewW / (intrinsicW || viewW || 1), viewH / (intrinsicH || viewH || 1))
    : viewW / (svgW || viewW || 1);
  // Like cssPixel but includes the bp→display conversion.  Use for anything whose
  // natural unit is bp (stroke widths, dot radii, arrow sizes, font sizes).
  // Uses bpToCSSPx so strokes/fonts scale at the same effective DPI as the geometry.
  const bpCSSPixel = bpToCSSPx * cssPixel * labelShrinkFactor;

  // ── Expand viewBox for element overshoot (dots, strokes, arrows) ──
  // Now that bpCSSPixel is known, compute how far each element extends
  // beyond its geometric center/path in viewBox units. Expand the viewBox
  // so that librsvg/sharp (which clips to viewBox) renders identically
  // to browsers (which honour overflow:visible).
  {
    let padL = 0, padR = 0, padT = 0, padB = 0; // extra space needed in viewBox units

    for (const dc of drawCommands) {
      if (dc.cmd === 'dot') {
        const dotLw = dc.pen ? dc.pen.linewidth : 0.5;
        const dotR = (dc.pen && dc.pen._lwExplicit ? 0.5 : dotfactor / 2) * dotLw * bpCSSPixel;
        const sx = (dc.pos.x - minX) * pxPerUnitX;
        const sy = (maxY - dc.pos.y) * pxPerUnitY;
        // Skip points far outside the viewport — their overshoot is invisible
        if (sx >= -dotR && sx <= viewW + dotR && sy >= -dotR && sy <= viewH + dotR) {
          padL = Math.max(padL, dotR - sx);
          padR = Math.max(padR, (sx + dotR) - viewW);
          padT = Math.max(padT, dotR - sy);
          padB = Math.max(padB, (sy + dotR) - viewH);
        }
      } else if (dc.path && dc.path.segs.length > 0) {
        const lw = dc.pen ? dc.pen.linewidth : 0.5;
        const halfStroke = (lw * bpCSSPixel) / 2;
        // Check path endpoints for stroke overshoot
        for (const seg of dc.path.segs) {
          for (const p of [seg.p0, seg.p3]) {
            const sx = (p.x - minX) * pxPerUnitX;
            const sy = (maxY - p.y) * pxPerUnitY;
            // Skip points far outside the viewport — their overshoot is invisible
            if (sx < -halfStroke || sx > viewW + halfStroke ||
                sy < -halfStroke || sy > viewH + halfStroke) continue;
            padL = Math.max(padL, halfStroke - sx);
            padR = Math.max(padR, (sx + halfStroke) - viewW);
            padT = Math.max(padT, halfStroke - sy);
            padB = Math.max(padB, (sy + halfStroke) - viewH);
          }
        }
        // Arrow overshoot: arrowheads extend perpendicular to the path by ~arrowLen/3.
        // ArcArrow uses wider arms (55° half-angle) so its perpendicular extent is larger.
        if (dc.arrow && dc.cmd === 'draw') {
          const baseSize = dc.arrow.size || 6;
          const arrowLen = baseSize * bpCSSPixel;
          const asty = dc.arrow.style || '';
          const isArc = asty === 'ArcArrow' || asty === 'EndArcArrow' ||
            asty === 'BeginArcArrow' || asty === 'ArcArrows';
          // ArcArrow perpendicular extent ≈ sin(55°) ≈ 0.82, plus bow factor 0.45
          const arrowR = arrowLen * (isArc ? 0.9 : 0.4); // perpendicular extent
          for (const seg of [dc.path.segs[0], dc.path.segs[dc.path.segs.length - 1]]) {
            for (const p of [seg.p0, seg.p3]) {
              const sx = (p.x - minX) * pxPerUnitX;
              const sy = (maxY - p.y) * pxPerUnitY;
              // Skip points far outside the viewport
              if (sx < -arrowR || sx > viewW + arrowR ||
                  sy < -arrowR || sy > viewH + arrowR) continue;
              padL = Math.max(padL, arrowR - sx);
              padR = Math.max(padR, (sx + arrowR) - viewW);
              padT = Math.max(padT, arrowR - sy);
              padB = Math.max(padB, (sy + arrowR) - viewH);
            }
          }
        }
      }
    }

    // Label/text overshoot: pad the viewBox so labels outside the geometry bbox
    // are visible. For autoScaled diagrams, Fix 5 has already reset minX/maxX to
    // geometry only, so this correctly extends the viewBox for out-of-bbox labels.
    // For size()-constrained diagrams (!isAutoScaled && !hasUnitScale):
    //   - Single-line labels: skip entirely. The solver already accounted for them.
    //   - Multi-line labels (numLines > 1): extend only VERTICALLY (padT/padB).
    //     The solver uses 0.48×numLines×fontSize for height, but actual rendered height
    //     uses 1.2×(numLines-1)+1.0 line spacing, so bottom tspan lines can overflow.
    //     The solver does handle horizontal placement correctly, so padL/padR are skipped.
    for (const dc of drawCommands) {
      if (dc.cmd !== 'label' && dc.cmd !== 'dot') continue;
      // dot commands without text don't produce labels
      if (dc.cmd === 'dot' && !dc.text) continue;

      const sx = (dc.pos.x - minX) * pxPerUnitX;
      const sy = (maxY - dc.pos.y) * pxPerUnitY;
      const fontSize = (dc.pen && dc.pen.fontsize) || 10;
      const fontSizeSVG = fontSize * bpCSSPixel;
      // Split raw text on \n first (minipage inserts \n; stripLaTeX collapses them)
      const rawLabelLines = (dc.text || '').split('\n');
      const cleanLabelLines = rawLabelLines.map(l => stripLaTeX(l)).filter(l => l.length > 0);
      const cleanLen = (cleanLabelLines.length > 0 ? Math.max(...cleanLabelLines.map(l => l.length)) : 1) || 1;
      const numLines = cleanLabelLines.length || 1;

      const isSizeConstrained = !isAutoScaled && !hasUnitScale;
      // For size()-constrained single-line labels: skip entirely (solver handles it).
      // Exception: tick labels and axis labels may extend beyond the solver-computed
      // geometry, so we still need to pad the viewBox for them.
      if (isSizeConstrained && numLines <= 1 && !dc._isTickLabel && !dc._isAxisLabel) continue;
      // Italic math labels (in KaTeX_Math) render wider than plain text; use a
      // larger char-width factor so viewBox pad covers the actual glyph extent.
      const hasMath = typeof dc.text === 'string' && /\$|\\/.test(dc.text);
      const charWFactor = hasMath ? 0.62 : 0.52;
      const W = cleanLen * fontSizeSVG * charWFactor;
      const H = fontSizeSVG * numLines;

      // For scaled/rotated labels, use the transformed bounding box dimensions.
      // Extract scale factor (sqrt(b²+e²)) and rotation from labelTransform so
      // that scale(0.8)*rotate(-60)*"text" is accounted for correctly.
      let effW = W, effH = H;
      if (dc.labelTransform) {
        const lt = dc.labelTransform;
        // Apply scale first
        const ltScale = Math.sqrt(lt.b * lt.b + lt.e * lt.e);
        let scaledW = W, scaledH = H;
        if (ltScale > 0 && Math.abs(ltScale - 1) > 0.01) {
          scaledW = W * ltScale;
          scaledH = H * ltScale;
        }
        // Then apply rotation to the scaled dimensions
        const ltAngle2 = Math.atan2(lt.e, lt.b) * 180 / Math.PI;
        if (Math.abs(ltAngle2) > 0.5) {
          const cosA2 = Math.abs(Math.cos(ltAngle2 * Math.PI / 180));
          const sinA2 = Math.abs(Math.sin(ltAngle2 * Math.PI / 180));
          effW = scaledW * cosA2 + scaledH * sinA2;
          effH = scaledW * sinA2 + scaledH * cosA2;
        } else {
          effW = scaledW;
          effH = scaledH;
        }
      }

      // Compute offset from alignment (same logic as label rendering)
      let dx = 0, dy = 0;
      if (dc.align) {
        const ax = dc.align.x, ay = dc.align.y;
        const margin = 0.25 * fontSizeSVG;
        const ax_n = ax * 0.5, ay_n = ay * 0.5;
        dx = ax_n * effW + ax * margin;
        dy = -(ay_n * effH + ay * margin);
      }
      // Apply per-command screen-space offsets (axis label autoshift). These are in
      // bp; convert to SVG user units via bpCSSPixel to match effW/effH scaling.
      if (dc.screenDx) dx += dc.screenDx * bpCSSPixel;
      if (dc.screenDy) dy += dc.screenDy * bpCSSPixel;

      // Text bounding box in viewBox coords (text-anchor="middle")
      const cx = sx + dx, cy = sy + dy;
      const left = cx - effW / 2;
      const right = cx + effW / 2;
      const top = cy - effH / 2;
      const bottom = cy + effH / 2;

      // Skip labels entirely outside the viewport — only when clip() is active,
      // labels far from the clip region are invisible and must not inflate
      // the viewBox (they would blow up the output dimensions).
      // Without clip(), labels beyond the geometry bbox still need overshoot expansion.
      if (hasClip && (right < 0 || left > viewW || bottom < 0 || top > viewH)) continue;

      if (isSizeConstrained) {
        // Size()-constrained: normally only extend vertically using actual tspan height.
        // Actual rendered height = fontSizeSVG × (1 + 1.2 × (numLines-1)) due to tspan dy.
        const hActual = fontSizeSVG * (1 + 1.2 * (numLines - 1));
        const topActual = cy - hActual / 2;
        const bottomActual = cy + hActual / 2;
        padT = Math.max(padT, -topActual);
        padB = Math.max(padB, bottomActual - viewH);
        // Tick labels and axis labels may extend horizontally beyond the solver-
        // computed bbox (solver uses geometry extent, but ticks/axis labels are
        // placed by alignment beyond that). Pad horizontally for these.
        if (dc._isTickLabel || dc._isAxisLabel) {
          padL = Math.max(padL, -left);
          padR = Math.max(padR, right - viewW);
        }
      } else {
        padL = Math.max(padL, -left);
        padR = Math.max(padR, right - viewW);
        padT = Math.max(padT, -top);
        padB = Math.max(padB, bottom - viewH);
      }
    }

    // Apply padding: shift origin and expand viewBox/display dimensions
    if (padL > 0 || padR > 0 || padT > 0 || padB > 0) {
      // Shift minX left and maxY up in user coords so rendering coordinates adjust
      minX -= padL / pxPerUnitX;
      maxY += padT / pxPerUnitY;
      const extraW = padL + padR;
      const extraH = padT + padB;
      const overshootScaleW = (viewW + extraW) / viewW;
      const overshootScaleH = (viewH + extraH) / viewH;
      viewW += extraW;
      viewH += extraH;
      // Scale display dimensions proportionally
      svgW *= overshootScaleW;
      svgH *= overshootScaleH;
      intrinsicW *= overshootScaleW;
      intrinsicH *= overshootScaleH;
    }
  }

  // Render draw commands in two passes: first paths/fills/dots, then labels on top
  // This prevents fills drawn later in program order from covering earlier labels
  // Dots are rendered in program order (not deferred) to allow later fills to cover them
  const deferredLabels = []; // [{ci, dc}]
  const aboveElementIndices = new Set(); // element indices from above=1 draw commands (excluded from crop clip)

  // Shorten a path from its end by `amount` viewport pixels.
  // Works on Bezier segments using de Casteljau subdivision.
  function shortenPathEnd(segs, amount, scaleX, scaleY) {
    if (segs.length === 0) return segs;
    let remaining = amount;
    // Work backwards, removing/shortening segments from the end
    while (remaining > 0 && segs.length > 0) {
      const s = segs[segs.length - 1];
      const segLen = bezierLength(s, scaleX, scaleY);
      if (segLen <= remaining + 1e-9) {
        // Remove entire segment
        remaining -= segLen;
        segs.pop();
      } else {
        // Shorten this segment: find parameter t where remaining arc length from end
        const t = findBezierParam(s, 1 - remaining / segLen, scaleX, scaleY);
        // Split at t, keep the first part
        const split = splitBezier(s, t);
        segs[segs.length - 1] = split[0];
        remaining = 0;
      }
    }
    return segs;
  }

  // Shorten a path from its beginning by `amount` viewport pixels.
  function shortenPathBegin(segs, amount, scaleX, scaleY) {
    if (segs.length === 0) return segs;
    let remaining = amount;
    // Work forwards, removing/shortening segments from the start
    while (remaining > 0 && segs.length > 0) {
      const s = segs[0];
      const segLen = bezierLength(s, scaleX, scaleY);
      if (segLen <= remaining + 1e-9) {
        remaining -= segLen;
        segs.shift();
      } else {
        const t = findBezierParam(s, remaining / segLen, scaleX, scaleY);
        const split = splitBezier(s, t);
        segs[0] = split[1];
        remaining = 0;
      }
    }
    return segs;
  }

  // Compute approximate arc length of a Bezier segment in viewport units
  function bezierLength(seg, scaleX, scaleY) {
    const steps = 16;
    let len = 0;
    let prevX = seg.p0.x * scaleX, prevY = seg.p0.y * scaleY;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pt = evalBezierSeg(seg, t);
      const cx = pt.x * scaleX, cy = pt.y * scaleY;
      len += Math.sqrt((cx - prevX) * (cx - prevX) + (cy - prevY) * (cy - prevY));
      prevX = cx; prevY = cy;
    }
    return len;
  }

  // Evaluate a cubic Bezier segment at parameter t
  function evalBezierSeg(seg, t) {
    const u = 1 - t;
    return {
      x: u*u*u*seg.p0.x + 3*u*u*t*seg.cp1.x + 3*u*t*t*seg.cp2.x + t*t*t*seg.p3.x,
      y: u*u*u*seg.p0.y + 3*u*u*t*seg.cp1.y + 3*u*t*t*seg.cp2.y + t*t*t*seg.p3.y
    };
  }

  // Find parameter t at which the arc length from start equals targetFraction * totalLength
  function findBezierParam(seg, targetFraction, scaleX, scaleY) {
    // Binary search for the parameter
    const totalLen = bezierLength(seg, scaleX, scaleY);
    const targetLen = targetFraction * totalLen;
    let lo = 0, hi = 1;
    for (let iter = 0; iter < 20; iter++) {
      const mid = (lo + hi) / 2;
      const subSeg = splitBezier(seg, mid)[0];
      const subLen = bezierLength(subSeg, scaleX, scaleY);
      if (subLen < targetLen) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Split a cubic Bezier segment at parameter t using de Casteljau algorithm
  // Returns [firstHalf, secondHalf] as segment objects
  function splitBezier(seg, t) {
    const u = 1 - t;
    // Level 1
    const a1x = u*seg.p0.x + t*seg.cp1.x, a1y = u*seg.p0.y + t*seg.cp1.y;
    const a2x = u*seg.cp1.x + t*seg.cp2.x, a2y = u*seg.cp1.y + t*seg.cp2.y;
    const a3x = u*seg.cp2.x + t*seg.p3.x, a3y = u*seg.cp2.y + t*seg.p3.y;
    // Level 2
    const b1x = u*a1x + t*a2x, b1y = u*a1y + t*a2y;
    const b2x = u*a2x + t*a3x, b2y = u*a2y + t*a3y;
    // Level 3 (split point)
    const cx = u*b1x + t*b2x, cy = u*b1y + t*b2y;
    return [
      {p0: {...seg.p0}, cp1: {x:a1x,y:a1y}, cp2: {x:b1x,y:b1y}, p3: {x:cx,y:cy}},
      {p0: {x:cx,y:cy}, cp1: {x:b2x,y:b2y}, cp2: {x:a3x,y:a3y}, p3: {...seg.p3}}
    ];
  }

  function renderPathCommand(ci, dc, css, dashArray) {
    if (dc.path._singlePoint) {
      const p = dc.path._singlePoint;
      const sx = (p.x - minX) * pxPerUnitX;
      const sy = (maxY - p.y) * pxPerUnitY;
      // Asymptote: single-point draw = zero-length stroke, radius = linewidth/2 (no dotfactor)
      const singleDotLw = dc.pen ? dc.pen.linewidth : 0.5;
      const singleDotR = (singleDotLw / 2) * bpCSSPixel;
      const circClip = dc._subpicClipId ? ` clip-path="url(#${dc._subpicClipId})"` : '';
      elements.push(`<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(singleDotR)}" fill="${css.fill}" stroke="none"${opacityAttr(css.opacity)}${circClip}/>`);
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
      return;
    }
    if (dc.path.segs.length === 0) return;

    // Shorten path at arrow end(s) so the stroke doesn't extend under the arrowhead
    let renderPath = dc.path;
    if (dc.arrow && dc.cmd === 'draw') {
      const style = dc.arrow.style;
      const baseSize = dc.arrow.size || 6;
      let arrowLen = baseSize * bpCSSPixel;
      // Clamp arrow length to 70% of total path length (same as generateArrowHead)
      let totalLen = 0;
      for (const s of dc.path.segs) {
        const dx = (s.p3.x - s.p0.x) * pxPerUnitX, dy = (s.p3.y - s.p0.y) * pxPerUnitY;
        totalLen += Math.sqrt(dx*dx + dy*dy);
      }
      if (arrowLen > totalLen * 0.7) arrowLen = totalLen * 0.7;

      const shortenEnd = (style === 'Arrow' || style === 'EndArrow' ||
        style === 'ArcArrow' || style === 'EndArcArrow' || style === 'Arrows' || style === 'ArcArrows');
      const shortenBegin = (style === 'BeginArrow' || style === 'BeginArcArrow' ||
        style === 'Arrows' || style === 'ArcArrows');

      if (shortenEnd || shortenBegin) {
        let segs = dc.path.segs.map(s => ({p0:{...s.p0}, cp1:{...s.cp1}, cp2:{...s.cp2}, p3:{...s.p3}}));

        if (shortenEnd && segs.length > 0) {
          segs = shortenPathEnd(segs, arrowLen, pxPerUnitX, pxPerUnitY);
        }
        if (shortenBegin && segs.length > 0) {
          segs = shortenPathBegin(segs, arrowLen, pxPerUnitX, pxPerUnitY);
        }

        renderPath = {segs, closed: dc.path.closed, _tag: dc.path._tag};
      }
    }

    const d = pathToD(renderPath, minX, maxY, pxPerUnitX, pxPerUnitY);
    let fill = 'none', stroke = 'none', strokeW = 0;

    if (dc.cmd === 'fill' || dc.cmd === 'unfill') {
      fill = dc.cmd === 'unfill' ? '#ffffff' : css.fill;
    } else if (dc.cmd === 'filldraw') {
      // If fill pen is invisible (opacity 0), use fill='none' so the stroke outline remains visible
      fill = (css.opacity === 0) ? 'none' : css.fill;
      if (dc.drawPen) {
        const drawCSS = penToCSS(dc.drawPen);
        drawCSS.strokeWidth *= bpCSSPixel;
        stroke = drawCSS.stroke;
        strokeW = drawCSS.strokeWidth;
      } else {
        // When filldraw has only one pen: fill with that pen, stroke with default pen (black)
        const defaultCSS = penToCSS(defaultPen);
        stroke = defaultCSS.stroke;
        strokeW = defaultCSS.strokeWidth * bpCSSPixel;
      }
    } else if (dc.cmd === 'clip') {
      return; // clip is handled via SVG <clipPath> defs
    } else {
      // draw
      stroke = css.stroke;
      strokeW = css.strokeWidth;
    }

    let attrs = `d="${d}"`;
    attrs += ` fill="${fill}"`;
    if (fill !== 'none' && dc.pen && dc.pen.fillrule) attrs += ` fill-rule="${dc.pen.fillrule}"`;
    if (stroke !== 'none') {
      attrs += ` stroke="${stroke}" stroke-width="${fmt(strokeW)}"`;
      if (dashArray) attrs += ` stroke-dasharray="${dashArray}"`;
      attrs += ` stroke-linecap="${(dc.pen && dc.pen.linecap) || 'round'}"`;
      attrs += ` stroke-linejoin="${(dc.pen && dc.pen.linejoin) || 'round'}"`;
    }
    // For filldraw with invisible fill (fill='none'), don't apply opacity to whole element
    // so the stroke outline remains visible at full opacity.
    // For fill/unfill/filldraw commands, TeXeR's PS-based pipeline flattens transparency
    // to opaque (e.g., cluster c583_L11 diagrams 12090/12091/12092/12095 use opacity(0.3)
    // on fills but the reference renders them as solid colors with last-fill-wins semantics).
    // Match that behavior by omitting opacity on fill-family commands.
    const isFillFamily = (dc.cmd === 'fill' || dc.cmd === 'unfill' || dc.cmd === 'filldraw');
    if (dc.cmd !== 'filldraw' || fill !== 'none') {
      if (!isFillFamily) attrs += opacityAttr(css.opacity);
    }
    if (dc._subpicClipId) attrs += ` clip-path="url(#${dc._subpicClipId})"`;

    elements.push(`<path ${attrs}/>`);
    commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});

    // Arrow heads
    if (dc.arrow && dc.cmd === 'draw') {
      const arrowEl = generateArrowHead(dc, minX, maxY, pxPerUnitX, pxPerUnitY, bpCSSPixel, css);
      if (arrowEl) {
        // Apply same clip-path to arrowhead as the path itself
        const clippedArrow = dc._subpicClipId
          ? arrowEl.replace(/(<(?:path|polygon)[^>]*)(\/>)/, `$1 clip-path="url(#${dc._subpicClipId})"$2`)
          : arrowEl;
        elements.push(clippedArrow);
        commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
      }
    }
  }

  // Build render order: background (above=-1, e.g. extend=true tick gridlines) first,
  // then normal (above=0) commands preserving program order,
  // then foreground (above=1) commands (e.g. axes with above=true)
  const renderOrder = [];
  for (let ci = 0; ci < drawCommands.length; ci++) {
    if (drawCommands[ci].above === -1) renderOrder.push(ci);
  }
  for (let ci = 0; ci < drawCommands.length; ci++) {
    if ((drawCommands[ci].above || 0) === 0) renderOrder.push(ci);
  }
  for (let ci = 0; ci < drawCommands.length; ci++) {
    if (drawCommands[ci].above === 1) renderOrder.push(ci);
  }

  // Pass 1: paths, fills, draws, and dots (non-above first, then above=true)
  for (const ci of renderOrder) {
    const dc = drawCommands[ci];
    const css = penToCSS(dc.pen);
    css.strokeWidth *= bpCSSPixel;
    const dashArray = linestyleToDasharray(dc.pen ? dc.pen.linestyle : null, css.strokeWidth);

    const elsBefore = elements.length;
    if (dc.cmd === 'label') {
      deferredLabels.push({ci, dc, css: {...css}});
    } else if (dc.cmd === 'image') {
      deferredLabels.push({ci, dc, css: {...css}});
    } else if (dc.cmd === 'dot') {
      // Render dots in program order so later fills can cover them
      const sx = (dc.pos.x - minX) * pxPerUnitX;
      const sy = (maxY - dc.pos.y) * pxPerUnitY;
      // Dot radius: when the pen has an explicit linewidth (from linewidth(n) or
      // the "n+pen" idiom), the linewidth IS the dot diameter (no dotfactor multiplier).
      // Otherwise (default pen), diameter = dotfactor * linewidth.
      const dotLw = dc.pen.linewidth;
      const dotR = (dc.pen && dc.pen._lwExplicit ? 0.5 : dotfactor / 2) * dotLw * bpCSSPixel;
      const dotClip = dc._subpicClipId ? ` clip-path="url(#${dc._subpicClipId})"` : '';
      if (dc.filltype && dc.filltype.style === 'UnFill') {
        // UnFill: open dot — white interior, colored ring.
        // Ring width is 40% of the dot radius so the white interior is always visible.
        const ringW = dotR * 0.4;
        elements.push(`<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(dotR)}" fill="white" stroke="${css.fill}" stroke-width="${fmt(ringW)}"${opacityAttr(css.opacity)}${dotClip}/>`);
      } else {
        elements.push(`<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="${fmt(dotR)}" fill="${css.fill}" stroke="none"${opacityAttr(css.opacity)}${dotClip}/>`);
      }
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
    } else if (dc.cmd === 'marker') {
      // draw(pair, path, pen): marker path is in bp/px units, centered at SVG position of pair
      const svgCX = (dc.pos.x - minX) * pxPerUnitX;
      const svgCY = (maxY - dc.pos.y) * pxPerUnitY;
      const mPath = dc.markerPath;
      if (mPath.segs.length > 0) {
        let d = '';
        for (let i = 0; i < mPath.segs.length; i++) {
          const s = mPath.segs[i];
          const p0x = svgCX + s.p0.x * cssPixel, p0y = svgCY - s.p0.y * cssPixel;
          const cp1x = svgCX + s.cp1.x * cssPixel, cp1y = svgCY - s.cp1.y * cssPixel;
          const cp2x = svgCX + s.cp2.x * cssPixel, cp2y = svgCY - s.cp2.y * cssPixel;
          const p3x = svgCX + s.p3.x * cssPixel, p3y = svgCY - s.p3.y * cssPixel;
          if (i === 0) {
            d += `M${fmt(p0x)} ${fmt(p0y)}`;
          } else {
            const prev = mPath.segs[i-1];
            const gap = Math.abs(s.p0.x - prev.p3.x) + Math.abs(s.p0.y - prev.p3.y);
            if (gap > 1e-9) d += ` M${fmt(p0x)} ${fmt(p0y)}`;
          }
          if (isLinear(s)) {
            d += ` L${fmt(p3x)} ${fmt(p3y)}`;
          } else {
            d += ` C${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(p3x)} ${fmt(p3y)}`;
          }
        }
        if (mPath.closed) d += ' Z';
        elements.push(`<path d="${d}" fill="none" stroke="${css.stroke}" stroke-width="${fmt(css.strokeWidth)}"/>`);
        commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
      }
    } else if (dc.path) {
      renderPathCommand(ci, dc, css, dashArray);
    }
    // Mark elements from above=1 commands for crop clip exclusion
    if (dc.above === 1) {
      for (let ei = elsBefore; ei < elements.length; ei++) {
        aboveElementIndices.add(ei);
      }
    }
  }

  // Track where label elements begin (for crop clip exclusion)
  const firstLabelIdx = elements.length;

  // Pass 2: labels on top (text always above graphics)
  for (const {ci, dc, css} of deferredLabels) {
    if (dc.cmd === 'label') {
      // Skip empty labels
      const sx = (dc.pos.x - minX) * pxPerUnitX;
      const sy = (maxY - dc.pos.y) * pxPerUnitY;
      const fontSize = (dc.pen.fontsize || 10);
      // Convert font size from PostScript points to SVG user units at the actual display scale.
      // font-size="12" in SVG user units renders as 12*(svgW/viewW) CSS px — at the default
      // 100px display size for a 14pt viewBox that is ~85 CSS px per character, completely
      // covering the drawing. Use cssPixel (viewW/svgW) to express the absolute pt size
      // as the correct fractional SVG user-unit value.
      let fontSizeSVG = fontSize * bpCSSPixel;  // SVG user units (bp → display px → viewBox)
      // foreignObject CSS is scaled by the SVG viewBox→display mapping (≈ bpToCSSPx),
      // so use raw pt value — the SVG transform provides the bp→CSS px conversion.
      // labelShrinkFactor < 1 when the scale solver fell back to uniform scaling
      // (labels too wide to fit via geometry shrink alone); fontSizeCSS must
      // also shrink because MathJax label width is computed from it directly.
      let fontSizeCSS = fontSize * labelShrinkFactor;
      // Pre-scale fontSizeSVG/fontSizeCSS for font-size commands (e.g. {\tiny...} from
      // minipage). Must happen before dx/margin is computed below so label placement is
      // correct. Single-line text handles this again via fontSizeCmdRe further below
      // (which strips the command and re-scales effectiveFontSize), but we must apply it
      // here first so fontSizeSVG is correct for W/H/margin computation.
      {
        const _preFsCmdRe = /\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)(?![a-zA-Z])/g;
        const _preFsSizes = {'\\tiny':0.5,'\\scriptsize':0.7,'\\footnotesize':0.8,'\\small':0.9,'\\normalsize':1.0,'\\large':1.2,'\\Large':1.44,'\\LARGE':1.728,'\\huge':2.074,'\\Huge':2.488};
        let _pfsm, _pfsScale = 1.0;
        while ((_pfsm = _preFsCmdRe.exec(dc.text||'')) !== null) _pfsScale = _preFsSizes[_pfsm[0]] || 1.0;
        if (_pfsScale !== 1.0) { fontSizeSVG *= _pfsScale; fontSizeCSS *= _pfsScale; }
      }
      let dx = 0, dy = 0;
      let anchor = 'middle';
      let baseline = 'central';
      if (dc.align) {
        // Asymptote algorithm (plain_Label.asy + drawlabel.cc):
        //   S = position + align * labelmargin          (small margin push)
        //   text center = S + (ax_n * W, ay_n * H)     (L∞-normalised box offset)
        // where ax_n = ax * 0.5 / max(|ax|,|ay|), same for y.
        const ax = dc.align.x, ay = dc.align.y;
        // Split raw text on \n first (minipage inserts \n; stripLaTeX collapses them)
        const rawDxLines = (dc.text || '').split('\n');
        const cleanDxLines = rawDxLines.map(l => stripLaTeX(l)).filter(l => l.length > 0);
        const cleanLen = (cleanDxLines.length > 0 ? Math.max(...cleanDxLines.map(l => l.length)) : 1) || 1;
        const numLines = cleanDxLines.length || 1;
        const W = cleanLen * fontSizeSVG * 0.52;
        const H = fontSizeSVG * numLines;
        const margin = 0.25 * fontSizeSVG;   // Asymptote default: labelmargin=0.25
        // Asymptote drawlabel.cc: z = align * 0.5; offset = (z.x*W, z.y*H)
        // The magnitude of align is NOT normalised — 2E pushes twice as far as E.
        const ax_n = ax * 0.5;
        const ay_n = ay * 0.5;
        dx = ax_n * W + ax * margin;
        dy = -(ay_n * H + ay * margin);   // negate: SVG y-axis is inverted
        anchor = 'middle';
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
        const estW = cleanLen * fontSizeSVG * 0.52 + fontSizeSVG * 0.1;
        const estH = fontSizeSVG * 1.0;
        let rx = parseFloat(fmt(sx + dx)), ry = parseFloat(fmt(sy + dy));
        // Adjust rectangle position based on anchor
        let rectX = rx - estW / 2;
        if (anchor === 'start') rectX = rx - fontSizeSVG * 0.05;
        else if (anchor === 'end') rectX = rx - estW + fontSizeSVG * 0.05;
        const rectY = ry - estH / 2;
        const pad = fontSizeSVG * 0.04;
        elements.push(`<rect x="${fmt(rectX - pad)}" y="${fmt(rectY - pad)}" width="${fmt(estW + 2*pad)}" height="${fmt(estH + 2*pad)}" fill="${bgHex}" stroke="none"/>`);
      }

      // Apply label transform (scale/rotate) if present
      let effectiveFontSize = fontSizeSVG;
      let effectiveFontSizeCSS = fontSizeCSS;
      let labelTransformAttr = '';
      if (dc.labelTransform) {
        const lt = dc.labelTransform;
        // Extract scale from transform matrix: scale = sqrt(b^2 + e^2) (x-axis scale)
        const scaleX = Math.sqrt(lt.b * lt.b + lt.e * lt.e);
        if (scaleX > 0 && Math.abs(scaleX - 1) > 0.01) {
          effectiveFontSize = fontSizeSVG * scaleX;
          effectiveFontSizeCSS = fontSizeCSS * scaleX;
        }
        // Extract rotation angle from transform matrix
        const angle = Math.atan2(lt.e, lt.b) * 180 / Math.PI;
        if (Math.abs(angle) > 0.1) {
          // For aligned rotated labels: recompute dx/dy using the rotated bounding box so
          // the label center is correctly offset from the anchor.  Asymptote positions the
          // label with its NW (for SE align) corner at the anchor point, using the axis-
          // aligned bounding box of the *rotated* text.
          if (dc.align) {
            const ax2 = dc.align.x, ay2 = dc.align.y;
            const cleanLen2 = (stripLaTeX(dc.text || '').length) || 1;
            const W2 = cleanLen2 * effectiveFontSize * 0.52;
            const H2 = effectiveFontSize;
            const margin2 = 0.25 * effectiveFontSize;
            const angleRad = Math.abs(angle * Math.PI / 180);
            const cosA = Math.abs(Math.cos(angleRad));
            const sinA = Math.abs(Math.sin(angleRad));
            const rotW = W2 * cosA + H2 * sinA;
            const rotH = W2 * sinA + H2 * cosA;
            dx = ax2 * 0.5 * rotW + ax2 * margin2;
            dy = -(ay2 * 0.5 * rotH + ay2 * margin2);
          }
          // Apply per-command screen-space offsets (used by axis labels to autoshift past
          // tick labels). Must be applied before baking dx/dy into the rotate pivot point.
          // screenDx/Dy are in bp; scale to viewBox units via bpCSSPixel.
          if (dc.screenDx) dx += dc.screenDx * bpCSSPixel;
          if (dc.screenDy) dy += dc.screenDy * bpCSSPixel;
          labelTransformAttr = ` transform="rotate(${fmt(-angle)}, ${fmt(sx+dx)}, ${fmt(sy+dy)})"`;
          // With rotation, text-anchor must be 'middle' so the label is centered at the
          // anchor point. 'end'/'start' causes text to extend off-screen after rotation.
          anchor = 'middle';
        }
      }

      // Apply per-command screen-space offsets for non-rotated labels (axis label autoshift).
      // For rotated labels, this was already applied above.
      if (!labelTransformAttr) {
        if (dc.screenDx) dx += dc.screenDx * bpCSSPixel;
        if (dc.screenDy) dy += dc.screenDy * bpCSSPixel;
      }

      // Handle multi-line text (produced by minipage with \n line breaks)
      if (rawText.includes('\n')) {
        // Font-size commands (e.g. {\tiny...}) are already applied to fontSizeSVG above,
        // and effectiveFontSize = fontSizeSVG, so no additional scaling is needed here.
        const lines = rawText.split('\n').filter(l => l.length > 0);
        const lineHeight = effectiveFontSize * 1.2;
        const totalOffset = (lines.length - 1) * lineHeight;
        const ff = 'KaTeX_Main, serif';
        const op = css.opacity != null && css.opacity < 1 ? ` opacity="${css.opacity}"` : '';
        let tspans = '';
        lines.forEach((line, i) => {
          const lineDy = i === 0 ? -totalOffset / 2 : lineHeight;
          tspans += `<tspan x="${fmt(sx+dx)}" dy="${fmt(lineDy)}">${escSvg(stripLaTeX(line.trim()))}</tspan>`;
        });
        const mlLabel = `<text x="${fmt(sx+dx)}" y="${fmt(sy+dy)}" fill="${css.fill}" font-size="${fmt(effectiveFontSize)}" text-anchor="middle" dominant-baseline="central" font-family="${ff}"${op}>${tspans}</text>`;
        elements.push(labelTransformAttr ? `<g${labelTransformAttr}>${mlLabel}</g>` : mlLabel);
        commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
        continue;
      }

      // Replace LaTeX dot/continuation symbols with Unicode so they render as SVG
      // text instead of KaTeX foreignObject (avoids MathML mspace artifact in \vdots).
      const LATEX_TO_UNICODE = {
        '\\vdots': '⋮', '\\ddots': '⋱', '\\iddots': '⋰', '\\cdots': '⋯', '\\ldots': '…', '\\dots': '⋯',
      };
      let displayText = rawText;

      // Detect and strip LaTeX font-size commands (\small, \tiny, \large, etc.)
      // These are text-mode commands that should scale the font, not route through KaTeX math.
      // Must happen before hasMath detection so the remaining text routes correctly.
      const fontSizeScales = {
        '\\tiny': 0.5, '\\scriptsize': 0.7, '\\footnotesize': 0.8, '\\small': 0.9,
        '\\normalsize': 1.0, '\\large': 1.2, '\\Large': 1.44, '\\LARGE': 1.728,
        '\\huge': 2.074, '\\Huge': 2.488,
      };
      // Match font-size commands: may appear inside or outside $...$, with optional braces
      const fontSizeCmdRe = /\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/g;
      let fontSizeScale = null;
      let fsmatch;
      while ((fsmatch = fontSizeCmdRe.exec(displayText)) !== null) {
        fontSizeScale = fontSizeScales[fsmatch[0]] || 1.0;
      }
      if (fontSizeScale !== null) {
        displayText = displayText.replace(fontSizeCmdRe, '');
        // Clean up: if stripping left only $$ (e.g. "$\small Outgoing light$" → "$ Outgoing light$"),
        // the $ delimiters were wrapping a text-mode command, not real math — remove them.
        const trimmed2 = displayText.trim();
        if (trimmed2.startsWith('$') && trimmed2.endsWith('$') && trimmed2.indexOf('$', 1) === trimmed2.length - 1) {
          const inner2 = trimmed2.slice(1, -1).trim();
          // If no remaining LaTeX math commands or ^/_ scripts, strip the $
          if (!/\\[a-zA-Z]/.test(inner2) && !/[\^_]/.test(inner2)) {
            displayText = inner2;
          }
        }
        effectiveFontSize *= fontSizeScale;
        effectiveFontSizeCSS *= fontSizeScale;
      }

      // Strip outer $...$, \reflectbox{}, and inner $...$ to check for simple symbols.
      // rawText may look like "\reflectbox{$\ddots$}" or "$\vdots$" etc.
      let probeText = rawText.trim();
      probeText = probeText.replace(/^\$+(.*?)\$+$/, '$1').trim();
      let isReflected = false;
      const reflectMatch2 = probeText.match(/^\\reflectbox\{([\s\S]*)\}$/);
      if (reflectMatch2) { isReflected = true; probeText = reflectMatch2[1].trim().replace(/^\$+(.*?)\$+$/, '$1').trim(); }
      if (LATEX_TO_UNICODE[probeText]) {
        displayText = LATEX_TO_UNICODE[probeText];
        // Apply horizontal reflection: ⋱ (ddots) reflected = ⋰ (iddots)
        if (isReflected && displayText === '⋱') displayText = '⋰';
      }
      else if (LATEX_TO_UNICODE[rawText.trim()]) displayText = LATEX_TO_UNICODE[rawText.trim()];
      // For mixed-dollar labels like "$\cdots$ 0 0 0 $\cdots$", replace each $...$
      // segment that contains only a simple Unicode-mappable symbol with its Unicode
      // equivalent.  This avoids the KaTeX foreignObject path (which doesn't rasterize
      // in librsvg/sharp) for labels that are mostly plain text with embedded symbols.
      // Skip this replacement in svg-native (rasterization) mode: there, the MathJax
      // SVG path renders mixed content with proper TeX typography/kerning, and the
      // Unicode-stripped version renders too wide (plain serif metrics > TeX text-mode).
      const svgNativeMode = opts && opts.labelOutput === 'svg-native';
      if (/\$/.test(displayText) && !svgNativeMode) {
        displayText = displayText.replace(/\$([^$]+)\$/g, (match, inner) => {
          const trimmed = inner.trim();
          if (LATEX_TO_UNICODE[trimmed]) return LATEX_TO_UNICODE[trimmed];
          return match;
        });
      }
      // Strip $...$ from simple math content (digits, letters, basic operators) so it
      // renders as SVG text instead of KaTeX foreignObject.  This avoids size/overlap
      // issues: foreignObject font-size is absolute CSS px and doesn't scale with the SVG.
      // Convert \definecolor{name}{RGB}{r,g,b} to hex and replace \color{name}
      // with \color{#hex} so KaTeX can render the colors natively.
      if (/\\definecolor/.test(displayText)) {
        const colorDefs = {};
        displayText = displayText.replace(
          /\\definecolor\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}/g,
          (_m, name, model, values) => {
            if (model.toUpperCase() === 'RGB') {
              const parts = values.split(',').map(v => parseInt(v.trim(), 10));
              if (parts.length === 3) {
                colorDefs[name] = '#' + parts.map(c =>
                  Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')
                ).join('');
              }
            }
            return '';
          }
        );
        displayText = displayText.replace(/\\color\s*\{([^}]*)\}/g, (_m, name) => {
          return colorDefs[name] ? '\\color{' + colorDefs[name] + '}' : _m;
        });
      }

      // Complex math (containing LaTeX commands or ^_) still goes through KaTeX.
      // Only strip $ when the entire label is $...$  (not mixed like "$W-1$ cells").
      let wasStrippedMath = false;
      const trimDT = displayText.trim();
      const isFullyWrapped = trimDT.startsWith('$') && trimDT.endsWith('$') && trimDT.indexOf('$', 1) === trimDT.length - 1;
      if (isFullyWrapped && !/\\[a-zA-Z]/.test(displayText) && !/[\^_]/.test(displayText)) {
        const stripped = displayText.replace(/\$/g, '').trim();
        if (/^[0-9a-zA-Z\s+\-*\/=.,!;:()\u00B1\u00D7\u2212]*$/.test(stripped)) {
          // Don't strip if content has multiple space-separated operator-only tokens
          // (e.g. "- - - - -" or "+ + +" — needs KaTeX math spacing to render correctly).
          const spaceSepOps = /([+\-*\/=])\s+\1/.test(stripped);
          if (!spaceSepOps) {
            displayText = stripped;
            wasStrippedMath = true;
          }
        }
      }

      const hasLaTeX = /\\(frac|underbrace|overbrace|sqrt)\b/.test(displayText);
      const hasMath = /\$/.test(displayText) || /\\[a-zA-Z]/.test(displayText);

      // Check if math content uses only LaTeX commands with known Unicode equivalents
      // (Greek letters, operators, etc.) plus simple ^/_ scripts.  Such labels render
      // more reliably as SVG <text> (scales with the viewBox) than as KaTeX foreignObject
      // (where CSS px sizing may mismatch the SVG coordinate system).
      // Mixed-content labels like "$W-1$ cells" must go through KaTeX, not the
      // unicodeSafe SVG path, so that text outside $...$ renders upright.
      const hasMixedDollars = /\$/.test(displayText) && !isFullyWrapped;
      let unicodeSafe = false;
      if (hasMath && !hasLaTeX && !hasMixedDollars) {
        let probe = displayText.replace(/\$/g, '');
        // Remove font-wrapper and spacing commands that renderLabelWithScripts handles
        probe = probe.replace(/\\(?:mathbf|mathrm|mathit|mathsf|mathtt|textbf|textit|textrm|text|operatorname)\s*\{[^}]*\}/g, '');
        probe = probe.replace(/\\hspace\s*\{[^}]*\}/g, '');
        // Remove all LaTeX commands that renderLabelWithScripts maps to Unicode
        const unicodeCmds = [
          '\\leftrightarrow','\\rightarrow','\\leftarrow','\\Rightarrow','\\Leftarrow',
          '\\longrightarrow','\\longleftarrow','\\Longrightarrow','\\Longleftarrow',
          '\\operatorname','\\parallel','\\triangle','\\upsilon','\\epsilon',
          '\\lambda','\\approx','\\bullet','\\otimes','\\subset','\\supset',
          '\\dagger','\\forall','\\exists','\\oplus',
          '\\alpha','\\beta','\\gamma','\\delta','\\theta','\\kappa',
          '\\sigma','\\omega','\\Gamma','\\Delta','\\Theta','\\Omega',
          '\\Lambda','\\Sigma','\\infty','\\wedge','\\angle','\\prime',
          '\\cdots','\\ldots','\\ddots','\\vdots',
          '\\zeta','\\iota','\\cdot','\\dots','\\perp','\\circ','\\star',
          '\\eta','\\mu','\\nu','\\xi','\\pi','\\le','\\ge',
          '\\rho','\\tau','\\phi','\\chi','\\psi',
          '\\Xi','\\Pi','\\Phi','\\Psi',
          '\\pm','\\mp','\\in',
          '\\times','\\div','\\leq','\\geq','\\neq','\\equiv',
          '\\notin','\\cup','\\cap','\\neg','\\vee','\\ell',
          '\\cos','\\sin','\\tan','\\log','\\ln',
          '\\sec','\\csc','\\cot','\\arcsin','\\arccos','\\arctan','\\exp','\\min','\\max',
          '\\spadesuit','\\heartsuit','\\diamondsuit','\\clubsuit',
          '\\square','\\blacksquare','\\lozenge',
          '\\nabla','\\partial','\\surd','\\checkmark',
          '\\varnothing','\\emptyset',
          '\\left','\\right',
          // Accent commands (\vec, \hat, \bar, etc.) are NOT unicode-safe — combining
          // diacriticals render poorly in SVG text.  Route them through KaTeX instead.
        ];
        for (const cmd of unicodeCmds) {
          while (probe.includes(cmd)) probe = probe.replace(cmd, '');
        }
        unicodeSafe = !/\\[a-zA-Z]/.test(probe);
        // Space-separated repeated operators (e.g. "- - - -" or "+ + +") need KaTeX
        // math spacing to render correctly; don't mark unicodeSafe.
        if (unicodeSafe && /([+\-*\/=])\s+\1/.test(probe)) unicodeSafe = false;
      }

      let labelEl;
      // Check for \mathbf-only or \textbf-only labels first: render as bold upright SVG text.
      // This works in all rendering contexts (sharp, <img>, <object>) without needing KaTeX CSS.
      // Must be checked before the italic math path to avoid wrong font-style.
      const strippedDollar = displayText.replace(/^\$+|\$+$/g, '').trim();
      if (hasMath && /^(\s*\\mathbf\s*\{[^}]*\}\s*)+$/.test(strippedDollar)) {
        // In math mode, spaces between \mathbf{X} \mathbf{Y} are ignored — concatenate directly.
        let boldContent = '';
        strippedDollar.replace(/\\mathbf\s*\{([^}]*)\}/g, (_, g) => { boldContent += g; });
        labelEl = renderLabelWithScripts(boldContent, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity, 'KaTeX_Main, serif', 'bold', 'normal');
      } else if (hasMath && /^(\s*\\textbf\s*\{[^}]*\}\s*)+$/.test(strippedDollar)) {
        const boldContent = strippedDollar.replace(/\\textbf\s*\{([^}]*)\}/g, '$1').trim();
        labelEl = renderLabelWithScripts(boldContent, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity, 'KaTeX_Main, serif', 'bold', 'normal');
      } else if (hasMath && /^(\s*\\(?:mathrm|textrm|text)\s*\{[^}]*\}\s*)+$/.test(strippedDollar)) {
        // \mathrm, \textrm, \text labels → upright roman (not math italic)
        let rmContent = '';
        strippedDollar.replace(/\\(?:mathrm|textrm|text)\s*\{([^}]*)\}/g, (_, g) => { rmContent += g; });
        labelEl = renderLabelWithScripts(rmContent, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity, 'KaTeX_Main, serif', 'normal', 'normal');
      } else if (hasLaTeX) {
        // Render complex LaTeX as SVG group with fractions/braces
        labelEl = renderLaTeXSVG(displayText, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, css.opacity);
      } else if (typeof katex !== 'undefined' && hasMath && !unicodeSafe) {
        // Use KaTeX for math rendering via foreignObject.  When rendering for
        // rasterization (labelOutput === 'svg-native'), go through MathJax
        // instead, which emits real <path> glyphs that librsvg can rasterize.
        if (opts && opts.labelOutput === 'svg-native') {
          labelEl = renderLabelMathJaxSVG(displayText, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity, effectiveFontSizeCSS);
        } else {
          labelEl = renderLabelKaTeX(displayText, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity, effectiveFontSizeCSS);
        }
      } else {
        // Render with superscript/subscript support using tspan.
        // If the label was originally $...$ math (wasStrippedMath or unicodeSafe) AND
        // contains Latin letters, use math italic font.  Pure digit/punctuation content
        // (e.g. coordinates like $(-6,4)$) stays upright — digits and punctuation are
        // upright in LaTeX math.
        const penFF = dc.pen && dc.pen.fontFamily;
        if ((wasStrippedMath || unicodeSafe) && /[a-zA-Z]/.test(displayText.replace(/\\[a-zA-Z]+/g, ''))) {
          labelEl = renderLabelWithScripts(displayText, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity, penFF || 'KaTeX_Math, serif', 'normal', penFF ? 'normal' : 'italic');
        } else {
          labelEl = renderLabelWithScripts(displayText, fmt(sx+dx), fmt(sy+dy), effectiveFontSize, css.fill, anchor, baseline, css.opacity, penFF || undefined);
        }
      }
      if (labelTransformAttr) {
        labelEl = `<g${labelTransformAttr}>${labelEl}</g>`;
      }
      elements.push(labelEl);
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
    } else if (dc.cmd === 'image' && dc.graphic) {
      // Render graphic() as <image> element
      const g = dc.graphic;
      const imgSize = computeGraphicDisplaySize(g, unitScale, hasUnitScale);

      // Display size in SVG viewBox units (user coords × pxPerUnit)
      let imgW = imgSize.w_user * pxPerUnitX;
      let imgH = imgSize.h_user * pxPerUnitY;

      // Position at label coordinates in SVG space
      const sx = (dc.pos.x - minX) * pxPerUnitX;
      const sy = (maxY - dc.pos.y) * pxPerUnitY;

      // Alignment offset: center by default, shift by align direction
      let dx = -imgW / 2, dy = -imgH / 2;
      if (dc.align) {
        const ax = dc.align.x, ay = dc.align.y;
        // Match Asymptote drawlabel.cc: z = align * 0.5 (no L∞ normalisation)
        const ax_n = ax * 0.5;
        const ay_n = ay * 0.5;
        dx = ax_n * imgW - imgW / 2;
        dy = -(ay_n * imgH) - imgH / 2; // SVG y flipped
      }

      // Extract scale and rotation from graphic.transform if present
      let scaleX = 1, scaleY = 1, angle = 0;
      let transformAttr = '';
      if (g.transform) {
        const lt = g.transform;
        scaleX = Math.sqrt(lt.b * lt.b + lt.e * lt.e);
        scaleY = Math.sqrt(lt.c * lt.c + lt.f * lt.f);
        angle = Math.atan2(lt.e, lt.b) * 180 / Math.PI;
        if (scaleX > 0 && Math.abs(scaleX - 1) > 0.01) { imgW *= scaleX; imgH *= scaleX; dx *= scaleX; dy *= scaleX; }
        if (Math.abs(angle) > 0.1) {
          transformAttr = ` transform="rotate(${fmt(-angle)}, ${fmt(sx)}, ${fmt(sy)})"`;
        }
      }

      const imgEl = `<image x="${fmt(sx + dx)}" y="${fmt(sy + dy)}" width="${fmt(imgW)}" height="${fmt(imgH)}" href="data:image/png;base64,${g.png_b64}" preserveAspectRatio="none"/>`;
      if (transformAttr) {
        elements.push(`<g${transformAttr}>${imgEl}</g>`);
      } else {
        elements.push(imgEl);
      }
      commandMap.push({cmdIdx: ci, elementIdx: elements.length-1, line: dc.line});
    }
  }

  // If crop clipping is active, wrap drawing elements (not <defs> or labels) in a <g clip-path>
  // Labels are excluded from clipping so axis labels outside the plot area remain visible
  // If user clip (Asymptote clip()) is active, wrap ALL elements (including labels) in <g clip-path>
  let innerContent;

  // Separate <defs> elements from content elements
  const defsEls = [];
  const contentEls = [];
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].startsWith('<defs>')) {
      defsEls.push(elements[i]);
    } else {
      contentEls.push({el: elements[i], origIdx: i});
    }
  }
  const contentFirstLabelIdx = firstLabelIdx - defsEls.length;

  if (cropClipId || userClipId) {
    const defsStr = defsEls.length > 0 ? defsEls.join('\n') + '\n' : '';
    let bodyContent;
    if (cropClipId) {
      // Crop: wrap non-label, non-above content; labels and above=true elements stay outside crop clip
      const clipEls = [];
      const unclipEls = [];
      for (let i = 0; i < contentEls.length; i++) {
        if (i >= contentFirstLabelIdx || aboveElementIndices.has(contentEls[i].origIdx)) {
          unclipEls.push(contentEls[i].el);
        } else {
          clipEls.push(contentEls[i].el);
        }
      }
      bodyContent = `<g clip-path="url(#${cropClipId})">\n${clipEls.join('\n')}\n</g>` +
        (unclipEls.length > 0 ? '\n' + unclipEls.join('\n') : '');
    } else {
      bodyContent = contentEls.map(e => e.el).join('\n');
    }
    // User clip wraps everything (including labels) — matches Asymptote behavior
    if (userClipId) {
      bodyContent = `<g clip-path="url(#${userClipId})">\n${bodyContent}\n</g>`;
    }
    innerContent = defsStr + bodyContent;
  } else {
    innerContent = elements.join('\n');
  }

  // Add background rect if currentlight.background is set
  let bgRect = '';
  if (currentlight && currentlight.background && isPen(currentlight.background)) {
    const bgPen = currentlight.background;
    const bgHex = '#' + [bgPen.r, bgPen.g, bgPen.b].map(c => {
      const h = Math.round(Math.max(0, Math.min(255, (c || 0) * 255))).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('');
    bgRect = `<rect x="0" y="0" width="${fmt(viewW)}" height="${fmt(viewH)}" fill="${bgHex}"/>\n`;
  }

  // With keepAspect=false, non-uniform scaling is baked into coordinates via
  // pxPerUnitX/Y — no preserveAspectRatio="none" needed.
  const parAttr = '';
  const svgStyle = '';
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(svgW)}" height="${fmt(svgH)}" viewBox="0 0 ${fmt(viewW)} ${fmt(viewH)}"${parAttr} overflow="visible" data-intrinsic-w="${fmt(intrinsicW)}" data-intrinsic-h="${fmt(intrinsicH)}">\n${svgStyle}${bgRect}${innerContent}\n</svg>`;

  return { svg: svgContent, commandMap, pxPerUnit, pxPerUnitX, pxPerUnitY, minX, minY, maxX, maxY, warnings, displayPercent };
}

function pathToD(path, minX, maxY, scaleX, scaleY) {
  if (scaleY === undefined) scaleY = scaleX; // backward compat
  const segs = path.segs;
  if (segs.length === 0) return '';
  let d = '';
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const p0x = (s.p0.x - minX)*scaleX, p0y = (maxY - s.p0.y)*scaleY;
    const cp1x = (s.cp1.x - minX)*scaleX, cp1y = (maxY - s.cp1.y)*scaleY;
    const cp2x = (s.cp2.x - minX)*scaleX, cp2y = (maxY - s.cp2.y)*scaleY;
    const p3x = (s.p3.x - minX)*scaleX, p3y = (maxY - s.p3.y)*scaleY;

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
  // Asymptote dash patterns from plain_pens.asy (in linewidth units when scale=true):
  //   dotted = linetype({0, 4})  — dot, 4× gap
  //   dashed = linetype({8, 8})
  //   longdashed = linetype({24, 8})
  //   dashdotted = linetype({8, 8, 0, 8})
  //   longdashdotted = linetype({24, 8, 0, 8})
  // SVG stroke-dasharray with round linecap: "0.01 X" produces round dots.
  switch(style) {
    case 'dashed': return `${8*w} ${8*w}`;
    case 'dotted': return `0.01 ${4*w}`;
    case 'longdashed': return `${24*w} ${8*w}`;
    case 'dashdotted': return `${8*w} ${8*w} 0.01 ${8*w}`;
    case 'longdashdotted': return `${24*w} ${8*w} 0.01 ${8*w}`;
    default:
      // Custom dash pattern from linetype("a b c ...") — space-separated numbers
      if (/^[\d.\s]+$/.test(style)) {
        const nums = style.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
        if (nums.length > 0) {
          return nums.map(n => (n === 0 ? 0.01 : n * w)).join(' ');
        }
      }
      return null;
  }
}

function generateArrowHead(dc, minX, maxY, scaleX, scaleY, bpCSSPixel, css) {
  const path = dc.path;
  const style = dc.arrow.style;
  // Arrow size: base size (default 6bp) converted to viewBox units via bpCSSPixel.
  // In Asymptote, arrowsize is in bp (PostScript points).  When size=0, Asymptote
  // uses arrowfactor*linewidth ≈ 6bp (matching our default of 6).
  const baseSize = dc.arrow.size || 6;
  let arrowLen = baseSize * bpCSSPixel;
  // Ensure a minimum of 3 viewBox units so that very small explicit sizes (e.g.
  // Arrow(TeXHead,1) in a size(200) diagram where bpCSSPixel≈1) remain visible
  // without over-scaling larger sizes like axisarrowsize≈4bp.
  if (arrowLen < 3) arrowLen = 3;

  // Get endpoint and tangent direction
  let segs = path.segs;
  if (segs.length === 0) return null;

  // Compute total path length in viewBox units and clamp arrowhead size
  let totalLen = 0;
  for (const s of segs) {
    const dx = (s.p3.x - s.p0.x) * scaleX, dy = (s.p3.y - s.p0.y) * scaleY;
    totalLen += Math.sqrt(dx*dx + dy*dy);
  }
  // Don't let arrowhead exceed 70% of path length
  if (arrowLen > totalLen * 0.7) arrowLen = totalLen * 0.7;

  const arrowParts = [];
  const isArcStyle = style === 'ArcArrow' || style === 'EndArcArrow' ||
    style === 'BeginArcArrow' || style === 'ArcArrows';
  // ArcArrow uses filled curved arrowhead (bowed-out shape); regular Arrow uses filled triangle.
  const filled = style !== 'Bar' && style !== 'Bars';

  function arrowAt(seg, atEnd) {
    let tip, tangentAngle;
    if (atEnd) {
      tip = seg.p3;
      const dx = (seg.p3.x - seg.cp2.x) * scaleX, dy = (seg.p3.y - seg.cp2.y) * scaleY;
      tangentAngle = Math.atan2(dy, dx);
      if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
        const ddx = (seg.p3.x - seg.p0.x) * scaleX, ddy = (seg.p3.y - seg.p0.y) * scaleY;
        tangentAngle = Math.atan2(ddy, ddx);
      }
    } else {
      tip = seg.p0;
      const dx = (seg.p0.x - seg.cp1.x) * scaleX, dy = (seg.p0.y - seg.cp1.y) * scaleY;
      tangentAngle = Math.atan2(dy, dx);
      if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
        const ddx = (seg.p0.x - seg.p3.x) * scaleX, ddy = (seg.p0.y - seg.p3.y) * scaleY;
        tangentAngle = Math.atan2(ddy, ddx);
      }
    }
    const tipX = (tip.x - minX)*scaleX, tipY = (maxY - tip.y)*scaleY;
    // Arrow head in screen coordinates (Y is already flipped)
    const screenAngle = -tangentAngle; // flip Y for screen coords
    const s = arrowLen;

    if (isArcStyle) {
      // ArcArrow: two curved bezier arms radiating from the tip, bowing outward.
      // Asymptote's ArcArrow uses wide arcs (55° half-angle) that bow away from
      // the arrowhead axis, creating a wing/crescent shape.
      const arcAngle = 55 * Math.PI / 180;
      const lx = tipX - s*Math.cos(screenAngle - arcAngle);
      const ly = tipY - s*Math.sin(screenAngle - arcAngle);
      const rx = tipX - s*Math.cos(screenAngle + arcAngle);
      const ry = tipY - s*Math.sin(screenAngle + arcAngle);
      const bow = s * 0.45;
      const cpLx = tipX - bow * Math.sin(screenAngle);
      const cpLy = tipY + bow * Math.cos(screenAngle);
      const cpRx = tipX + bow * Math.sin(screenAngle);
      const cpRy = tipY - bow * Math.cos(screenAngle);
      const d = `M${fmt(lx)} ${fmt(ly)} Q${fmt(cpLx)} ${fmt(cpLy)} ${fmt(tipX)} ${fmt(tipY)} ` +
                `M${fmt(tipX)} ${fmt(tipY)} Q${fmt(cpRx)} ${fmt(cpRy)} ${fmt(rx)} ${fmt(ry)}`;
      return {d, filled: false};
    }

    const headAngle = 25 * Math.PI / 180;
    const lx = tipX - s*Math.cos(screenAngle - headAngle);
    const ly = tipY - s*Math.sin(screenAngle - headAngle);
    const rx = tipX - s*Math.cos(screenAngle + headAngle);
    const ry = tipY - s*Math.sin(screenAngle + headAngle);
    return {d: `M${fmt(lx)} ${fmt(ly)} L${fmt(tipX)} ${fmt(tipY)} L${fmt(rx)} ${fmt(ry)} Z`, filled};
  }

  if (style === 'Arrow' || style === 'EndArrow' || style === 'ArcArrow' || style === 'EndArcArrow') {
    arrowParts.push(arrowAt(segs[segs.length-1], true));
  } else if (style === 'BeginArrow' || style === 'BeginArcArrow') {
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
  if (isFilled) {
    return `<path d="${d}" fill="${fillAttr}" stroke="none"/>`;
  }
  return `<path d="${d}" fill="none" stroke="${css.stroke}" stroke-width="${fmt(css.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Render label text with superscript/subscript support as SVG
function renderLabelWithScripts(rawText, x, y, fontSize, fill, anchor, baseline, opacity, fontFamily, fontWeight, fontStyle) {
  // First apply LaTeX-to-Unicode mapping (same as stripLaTeX but preserving ^/_)
  let s = rawText || '';
  s = s.replace(/\$/g, '');
  // Detect \textbf / \mathbf → bold; \textit / \mathit → italic (whole-label heuristic)
  if ((!fontWeight || fontWeight === 'normal') && /\\(?:textbf|mathbf)\s*\{/.test(s)) fontWeight = 'bold';
  if ((!fontStyle  || fontStyle  === 'normal') && /\\(?:textit|mathit)\s*\{/.test(s)) fontStyle  = 'italic';
  // Use private-use sentinel chars \x01…\x02 as open/close markers for upright spans.
  const UPRIGHT_OPEN = '\x01';
  const UPRIGHT_CLOSE = '\x02';
  // Handle \mathrm / \textrm / \text / \operatorname — wrap contents in upright sentinels
  // so they render non-italic even when the surrounding label is in math-italic mode.
  s = s.replace(/\\(?:mathrm|textrm|text|operatorname)\s*\{([^}]*)\}/g,
    (_m, inner) => UPRIGHT_OPEN + inner + UPRIGHT_CLOSE);
  // Strip other styling commands (bold/italic/sf/tt already handled via fontWeight/Style detection).
  s = s.replace(/\\(?:mathbf|mathit|mathsf|mathtt|textbf|textit)\s*\{([^}]*)\}/g, '$1');
  s = s.replace(/\\hspace\s*\{[^}]*\}/g, ' ');
  // In math-italic mode, mark operator names so they render upright (as in real LaTeX).
  // Must happen before texMap converts \cos → 'cos', so we can distinguish operator text
  // from ordinary italic variables.
  if (fontStyle === 'italic') {
    s = s.replace(/\\(arcsin|arccos|arctan|sin|cos|tan|sec|csc|cot|log|ln|exp|lim|inf|sup|gcd|det|ker|dim|deg|hom|arg)(?![a-zA-Z])/g,
      (_m, op) => UPRIGHT_OPEN + op + UPRIGHT_CLOSE);
  }
  // Trigger mixed upright/italic rendering when any upright sentinels are present.
  const needsUprightOps = s.includes(UPRIGHT_OPEN);
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
    '\\cdot':'·','\\cdots':'⋯','\\ldots':'…','\\vdots':'⋮','\\ddots':'⋱','\\dots':'⋯',
    '\\le':'≤','\\leq':'≤','\\ge':'≥','\\geq':'≥',
    '\\neq':'≠','\\approx':'≈','\\equiv':'≡',
    '\\in':'∈','\\notin':'∉','\\subset':'⊂','\\supset':'⊃',
    '\\cup':'∪','\\cap':'∩','\\forall':'∀','\\exists':'∃','\\neg':'¬',
    '\\wedge':'∧','\\vee':'∨','\\oplus':'⊕','\\otimes':'⊗',
    '\\rightarrow':'\u2192','\\leftarrow':'\u2190','\\Rightarrow':'\u21D2','\\Leftarrow':'\u21D0',
    '\\longrightarrow':'\u2192','\\longleftarrow':'\u2190','\\Longrightarrow':'\u21D2','\\Longleftarrow':'\u21D0',
    '\\leftrightarrow':'\u2194','\\triangle':'\u25B3','\\angle':'\u2220','\\perp':'\u22A5',
    '\\parallel':'∥','\\circ':'∘','\\bullet':'•','\\star':'★','\\dagger':'†',
    '\\ell':'ℓ','\\prime':'′',
    '\\spadesuit':'♠','\\heartsuit':'♡','\\diamondsuit':'♢','\\clubsuit':'♣',
    '\\square':'□','\\blacksquare':'■','\\lozenge':'◊',
    '\\nabla':'∇','\\partial':'∂','\\surd':'√','\\checkmark':'✓',
    '\\varnothing':'∅','\\emptyset':'∅',
    '\\cos':'cos','\\sin':'sin','\\tan':'tan','\\log':'log','\\ln':'ln',
    '\\sec':'sec','\\csc':'csc','\\cot':'cot','\\arcsin':'arcsin',
    '\\arccos':'arccos','\\arctan':'arctan','\\exp':'exp','\\min':'min','\\max':'max',
    '\\left':'','\\right':'',
    '\\%':'%','\\#':'#','\\&':'&','\\$':'$',
  };
  const sortedEntries = Object.entries(texMap).sort((a,b) => b[0].length - a[0].length);
  for (const [cmd, uni] of sortedEntries) s = s.split(cmd).join(uni);
  // Handle \<space> (TeX inter-word space), \~ (non-breaking space), \; \, \: (thin/medium space), \! (negative thin space) → space
  s = s.replace(/\\[ ~;,:!]/g, ' ');
  // Strip \definecolor{name}{model}{values} declarations (no visible output)
  s = s.replace(/\\definecolor\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}/g, '');
  // Strip \color{name} commands, keeping surrounding text
  s = s.replace(/\\color\s*\{[^}]*\}/g, '');
  // Strip \rm (font switch, not braced form)
  s = s.replace(/\\rm\b/g, '');
  // Handle accent commands: \vec{X} → X⃗, \hat{X} → X̂, \bar{X} → X̄, etc.
  s = s.replace(/\\vec\s*\{([^}]*)\}/g, '$1\u20D7');
  s = s.replace(/\\hat\s*\{([^}]*)\}/g, '$1\u0302');
  s = s.replace(/\\bar\s*\{([^}]*)\}/g, '$1\u0304');
  s = s.replace(/\\tilde\s*\{([^}]*)\}/g, '$1\u0303');
  s = s.replace(/\\dot\s*\{([^}]*)\}/g, '$1\u0307');
  s = s.replace(/\\ddot\s*\{([^}]*)\}/g, '$1\u0308');
  s = s.replace(/\\overline\s*\{([^}]*)\}/g, '$1\u0305');
  s = s.replace(/\\underline\s*\{([^}]*)\}/g, '$1\u0332');
  s = s.replace(/\\overrightarrow\s*\{([^}]*)\}/g, '$1\u20D7');
  // Remove remaining \commands
  s = s.replace(/\\[a-zA-Z]+/g, '');
  // NOTE: Do NOT strip braces here — the subscript/superscript parser below
  // needs them to detect multi-character groups like _{k-1}.  Stray braces
  // are cleaned up after parsing (see below).
  s = s.replace(/\s+/g, ' ').trim();

  // Check for super/subscripts
  const hasSS = /[_^]/.test(s);
  if (!hasSS) {
    // Strip LaTeX grouping braces: \{ and \} become visible braces; bare { } are grouping syntax
    s = s.replace(/\\{/g, '\uE001').replace(/\\}/g, '\uE002');
    s = s.replace(/[{}]/g, '');
    s = s.replace(/\uE001/g, '{').replace(/\uE002/g, '}');
    // Simple text, no scripts
    const op = opacity != null && opacity < 1 ? ` opacity="${opacity}"` : '';
    const ff = fontFamily || 'KaTeX_Main, serif';
    const fwAttr = fontWeight && fontWeight !== 'normal' ? ` font-weight="${fontWeight}"` : '';
    const fsAttr = fontStyle && fontStyle !== 'normal' ? ` font-style="${fontStyle}"` : '';
    if (needsUprightOps && s.includes(UPRIGHT_OPEN)) {
      // Build mixed italic + upright content: operator names get upright tspan elements
      const segs = s.split(/\x01([^\x02]*)\x02/);
      let mixed = '';
      for (let si = 0; si < segs.length; si++) {
        if (si % 2 === 0) { mixed += escSvg(segs[si]); }
        else { mixed += `<tspan font-family="KaTeX_Main, serif" font-style="normal">${escSvg(segs[si])}</tspan>`; }
      }
      return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-family="${ff}"${fwAttr}${fsAttr}${op}>${mixed}</text>`;
    }
    return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-family="${ff}"${fwAttr}${fsAttr}${op}>${escSvg(s)}</text>`;
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

  // Strip any leftover braces from part text (braces were preserved for
  // subscript/superscript group detection above, clean up now).
  for (const p of parts) p.text = p.text.replace(/[{}]/g, '');

  // Build SVG text with tspan elements
  const op = opacity != null && opacity < 1 ? ` opacity="${opacity}"` : '';
  let inner = '';
  for (const p of parts) {
    if (p.mode === 'sup') {
      const supText = needsUprightOps ? p.text.replace(/\x01|\x02/g, '') : p.text;
      const supUpright = needsUprightOps && p.text.includes(UPRIGHT_OPEN) ? ' font-family="KaTeX_Main, serif" font-style="normal"' : '';
      inner += `<tspan dy="${fmt(-fontSize * 0.35)}" font-size="${fmt(fontSize * 0.7)}"${supUpright}>${escSvg(supText)}</tspan><tspan dy="${fmt(fontSize * 0.35)}" font-size="${fmt(fontSize)}"></tspan>`;
    } else if (p.mode === 'sub') {
      const subText = needsUprightOps ? p.text.replace(/\x01|\x02/g, '') : p.text;
      const subUpright = needsUprightOps && p.text.includes(UPRIGHT_OPEN) ? ' font-family="KaTeX_Main, serif" font-style="normal"' : '';
      inner += `<tspan dy="${fmt(fontSize * 0.25)}" font-size="${fmt(fontSize * 0.7)}"${subUpright}>${escSvg(subText)}</tspan><tspan dy="${fmt(-fontSize * 0.25)}" font-size="${fmt(fontSize)}"></tspan>`;
    } else {
      if (needsUprightOps && p.text.includes(UPRIGHT_OPEN)) {
        // Mixed italic + upright in base text
        const segs2 = p.text.split(/\x01([^\x02]*)\x02/);
        for (let si = 0; si < segs2.length; si++) {
          if (si % 2 === 0) { inner += escSvg(segs2[si]); }
          else { inner += `<tspan font-family="KaTeX_Main, serif" font-style="normal">${escSvg(segs2[si])}</tspan>`; }
        }
      } else {
        inner += escSvg(p.text);
      }
    }
  }
  const ff2 = fontFamily || 'KaTeX_Main, serif';
  const fwAttr2 = fontWeight && fontWeight !== 'normal' ? ` font-weight="${fontWeight}"` : '';
  const fsAttr2 = fontStyle && fontStyle !== 'normal' ? ` font-style="${fontStyle}"` : '';
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-family="${ff2}"${fwAttr2}${fsAttr2}${op}>${inner}</text>`;
}

// Replace LaTeX commands that KaTeX doesn't recognize with supported
// equivalents.  amssymb's \bigstar, \blacksquare, etc. are not in KaTeX's
// default command set; use Unicode characters wrapped in \text{} so they
// render reliably.
function preprocessLatexForKatex(src) {
  if (typeof src !== 'string') return src;
  const replacements = [
    [/\\bigstar\b/g,      '\\text{\u2605}'],       // ★
    [/\\blacksquare\b/g,  '\\text{\u25A0}'],       // ■
    [/\\blacklozenge\b/g, '\\text{\u29EB}'],       // ⧫
    [/\\blacktriangle\b/g,'\\text{\u25B2}'],       // ▲
    [/\\blacktriangledown\b/g,'\\text{\u25BC}'],   // ▼
    [/\\lozenge\b/g,      '\\text{\u25CA}'],       // ◊
    [/\\square\b/g,       '\\text{\u25A1}'],       // □
    [/\\vartriangle\b/g,  '\\text{\u25B3}'],       // △
    [/\\triangledown\b/g, '\\text{\u25BD}'],       // ▽
    [/\\circledast\b/g,   '\\text{\u229B}'],       // ⊛
    [/\\circledcirc\b/g,  '\\text{\u229A}'],       // ⊚
    [/\\complement\b/g,   '\\text{\u2201}'],       // ∁
  ];
  for (const [re, to] of replacements) src = src.replace(re, to);
  return src;
}

function renderLabelKaTeX(rawText, x, y, fontSize, fill, anchor, baseline, opacity, fontSizeCSS) {
  // fontSize: SVG user units (for foreignObject width/height dimensions)
  // fontSizeCSS: CSS pixels for the HTML font-size inside the foreignObject (default = fontSize)
  if (fontSizeCSS === undefined) fontSizeCSS = fontSize;
  // Extract math content: strip $ delimiters, render via KaTeX
  let math = (rawText || '').trim();
  // Handle \reflectbox{...} wrapper: extract inner content, apply CSS horizontal flip
  let reflectX = false;
  const reflectMatch = math.match(/^\\reflectbox\{([\s\S]*)\}$/);
  if (reflectMatch) {
    reflectX = true;
    math = reflectMatch[1].trim();
  }
  // Check if wrapped in a single $...$  (not mixed like "$\cdots$ text $\cdots$")
  const isDollar = math.startsWith('$') && math.endsWith('$') && math.indexOf('$', 1) === math.length - 1;
  if (isDollar) math = math.slice(1, -1);
  // Remove double $$ too
  if (math.startsWith('$') && math.endsWith('$') && math.indexOf('$', 1) === math.length - 1) math = math.slice(1, -1);

  // Preprocess: replace LaTeX commands that KaTeX doesn't support with
  // equivalents or Unicode characters.
  math = preprocessLatexForKatex(math);

  let html;
  // Check for mixed text/math content (e.g. "$W-1$ cells" or "$\cdots$ 0 0 $\cdots$")
  const hasMixedContent = !isDollar && /\$[^$]+\$/.test(math);
  if (hasMixedContent) {
    // Parse into math and text segments, render each separately
    const segments = [];
    let pos = 0;
    const reSegment = /\$([^$]+)\$/g;
    let m;
    while ((m = reSegment.exec(math)) !== null) {
      if (m.index > pos) segments.push({type: 'text', content: math.slice(pos, m.index)});
      segments.push({type: 'math', content: m[1]});
      pos = m.index + m[0].length;
    }
    if (pos < math.length) segments.push({type: 'text', content: math.slice(pos)});
    html = '';
    for (const seg of segments) {
      if (seg.type === 'math') {
        html += katex.renderToString(seg.content, {throwOnError: false, displayMode: false, output: 'html'});
      } else {
        // Preserve spaces: HTML collapses leading/trailing whitespace in text nodes
        // adjacent to inline elements (KaTeX output).  Use &nbsp; for spaces.
        html += seg.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
      }
    }
  } else {
    try {
      html = katex.renderToString(math, {throwOnError: false, displayMode: false, output: 'html'});
    } catch(e) {
      // Fallback to Unicode rendering
      return renderLabelWithScripts(rawText, x, y, fontSize, fill, anchor, baseline, opacity);
    }
  }

  // Estimate dimensions for foreignObject
  const cleanLen = stripLaTeX(rawText).length;
  const estW = Math.max(cleanLen * fontSize * 0.7, fontSize * 1.2);
  // Fractions (\frac) need extra vertical space; use taller estimate for them
  const hasFrac = /\\frac\b/.test(rawText);
  const estH = hasFrac ? fontSize * 3.0 : fontSize * 1.8;

  // Compute foreignObject position based on anchor
  let fx = parseFloat(x), fy = parseFloat(y);
  if (anchor === 'middle') fx -= estW / 2;
  else if (anchor === 'end') fx -= estW;
  fy -= estH / 2; // vertically center

  const op = opacity != null && opacity < 1 ? ` opacity="${opacity}"` : '';
  const colorStyle = `color:${fill || '#000000'};`;
  const reflectStyle = reflectX ? 'transform:scaleX(-1);' : '';
  // KaTeX CSS applies .katex { font-size: 1.21em } internally, so divide by 1.21
  // to get the correct effective size matching Asymptote/LaTeX output.
  const katexCSS = fontSizeCSS / 1.21;
  return `<foreignObject x="${fmt(fx)}" y="${fmt(fy)}" width="${fmt(estW)}" height="${fmt(estH)}" overflow="visible"${op}><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:'Computer Modern Serif','Latin Modern Roman','CMU Serif','STIX Two Text','Times New Roman',serif;font-size:${fmt(katexCSS)}px;${colorStyle}${reflectStyle}display:flex;align-items:center;justify-content:${anchor === 'end' ? 'flex-end' : anchor === 'start' ? 'flex-start' : 'center'};height:100%;overflow:visible;">${html}</div></foreignObject>`;
}

// --- MathJax SVG rendering (Node-only, for rasterization pipeline) ---
// librsvg/sharp silently drop <foreignObject>, so the KaTeX path above
// produces blank labels when the SVG is rasterized to PNG for SSIM
// comparison. When `opts.labelOutput === 'svg-native'`, we instead use
// MathJax's SVG output (which emits real <path>/<use>/<g> glyphs that
// rasterize correctly).
let _mjxState = null; // { doc, adaptor } | { unavailable:true } | null
function _ensureMathJax() {
  if (_mjxState) return _mjxState.unavailable ? null : _mjxState;
  if (typeof require === 'undefined') { _mjxState = { unavailable: true }; return null; }
  try {
    const { mathjax } = require('mathjax-full/js/mathjax.js');
    const { TeX } = require('mathjax-full/js/input/tex.js');
    const { SVG } = require('mathjax-full/js/output/svg.js');
    const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
    const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
    const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: AllPackages });
    const svg = new SVG({ fontCache: 'local' });
    const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });
    _mjxState = { doc, adaptor };
    return _mjxState;
  } catch (e) {
    _mjxState = { unavailable: true };
    return null;
  }
}

const _mjxCache = new Map();

// Pre-render a label through MathJax (if available) to get its actual pixel
// dimensions in bp.  Returns { wBp, hBp } on success, null on failure.
// Used by the scale solver to get accurate label widths — the glyph-count
// heuristic under-estimates wide sans-serif/bold text (e.g. \textsf{NOON})
// by 2×+, which prevents the solver from detecting label-dominated layouts
// that exceed size() and require uniform downscaling.
function _mjxMeasureBp(rawText, fontSize) {
  const state = _ensureMathJax();
  if (!state) return null;
  // Normalize text following renderLabelMathJaxSVG's pre-processing.
  let math = (rawText || '').trim();
  const reflectMatch = math.match(/^\\reflectbox\{([\s\S]*)\}$/);
  if (reflectMatch) math = reflectMatch[1].trim();
  const isDollar = math.startsWith('$') && math.endsWith('$') && math.indexOf('$', 1) === math.length - 1;
  if (isDollar) math = math.slice(1, -1);
  if (math.startsWith('$') && math.endsWith('$') && math.indexOf('$', 1) === math.length - 1) math = math.slice(1, -1);
  const hasMixedContent = !isDollar && /\$[^$]+\$/.test(math);
  if (hasMixedContent) {
    const segments = [];
    let pos = 0;
    const reSegment = /\$([^$]+)\$/g;
    let m;
    while ((m = reSegment.exec(math)) !== null) {
      if (m.index > pos) segments.push({type:'text', content: math.slice(pos, m.index)});
      segments.push({type:'math', content: m[1]});
      pos = m.index + m[0].length;
    }
    if (pos < math.length) segments.push({type:'text', content: math.slice(pos)});
    math = segments.map(seg => {
      if (seg.type === 'math') return seg.content;
      const esc = seg.content.replace(/([\\{}$&#^_%~])/g, '\\$1');
      return '\\text{' + esc + '}';
    }).join('');
  }

  let parsed = _mjxCache.get(math);
  if (!parsed) {
    try {
      const node = state.doc.convert(math, { display: false, em: 16, ex: 8, containerWidth: 1280 });
      const html = state.adaptor.outerHTML(node);
      const mOuter = html.match(/<svg([^>]*)>([\s\S]*)<\/svg>/);
      if (!mOuter) { _mjxCache.set(math, { error: true }); return null; }
      const attrs = mOuter[1];
      const wM = attrs.match(/\swidth="([-0-9.]+)ex"/);
      const hM = attrs.match(/\sheight="([-0-9.]+)ex"/);
      const vbM = attrs.match(/\sviewBox="([^"]+)"/);
      if (!wM || !hM || !vbM) { _mjxCache.set(math, { error: true }); return null; }
      parsed = { wEx: parseFloat(wM[1]), hEx: parseFloat(hM[1]), viewBox: vbM[1], inner: mOuter[2] };
      _mjxCache.set(math, parsed);
    } catch (e) {
      _mjxCache.set(math, { error: true });
      return null;
    }
  }
  if (parsed.error || !parsed.wEx) return null;

  // Match renderLabelMathJaxSVG: em = fontSize/1.21, exRatio = 0.5.
  const em = fontSize / 1.21;
  const exRatio = 0.5;
  return { wBp: parsed.wEx * exRatio * em, hBp: parsed.hEx * exRatio * em };
}

function renderLabelMathJaxSVG(rawText, x, y, fontSize, fill, anchor, baseline, opacity, fontSizeCSS) {
  const state = _ensureMathJax();
  if (!state) return renderLabelKaTeX(rawText, x, y, fontSize, fill, anchor, baseline, opacity, fontSizeCSS);
  if (fontSizeCSS === undefined) fontSizeCSS = fontSize;

  // Mirror renderLabelKaTeX's text extraction.
  let math = (rawText || '').trim();
  let reflectX = false;
  const reflectMatch = math.match(/^\\reflectbox\{([\s\S]*)\}$/);
  if (reflectMatch) { reflectX = true; math = reflectMatch[1].trim(); }
  const isDollar = math.startsWith('$') && math.endsWith('$') && math.indexOf('$', 1) === math.length - 1;
  if (isDollar) math = math.slice(1, -1);
  if (math.startsWith('$') && math.endsWith('$') && math.indexOf('$', 1) === math.length - 1) math = math.slice(1, -1);
  const hasMixedContent = !isDollar && /\$[^$]+\$/.test(math);
  if (hasMixedContent) {
    // Reconstruct using \text{...} for non-math segments so MathJax lays it out as one box.
    const segments = [];
    let pos = 0;
    const reSegment = /\$([^$]+)\$/g;
    let m;
    while ((m = reSegment.exec(math)) !== null) {
      if (m.index > pos) segments.push({type:'text', content: math.slice(pos, m.index)});
      segments.push({type:'math', content: m[1]});
      pos = m.index + m[0].length;
    }
    if (pos < math.length) segments.push({type:'text', content: math.slice(pos)});
    math = segments.map(seg => {
      if (seg.type === 'math') return seg.content;
      // Escape TeX-special characters inside \text{...}
      const esc = seg.content.replace(/([\\{}$&#^_%~])/g, '\\$1');
      return '\\text{' + esc + '}';
    }).join('');
  }

  let parsed = _mjxCache.get(math);
  if (!parsed) {
    let html;
    try {
      const node = state.doc.convert(math, { display: false, em: 16, ex: 8, containerWidth: 1280 });
      html = state.adaptor.outerHTML(node);
    } catch (e) {
      parsed = { error: true };
      _mjxCache.set(math, parsed);
    }
    if (!parsed) {
      const mOuter = html.match(/<svg([^>]*)>([\s\S]*)<\/svg>/);
      if (!mOuter) {
        parsed = { error: true };
      } else {
        const attrs = mOuter[1];
        const inner = mOuter[2];
        const wM = attrs.match(/\swidth="([-0-9.]+)ex"/);
        const hM = attrs.match(/\sheight="([-0-9.]+)ex"/);
        const vbM = attrs.match(/\sviewBox="([^"]+)"/);
        const vaM = attrs.match(/vertical-align:\s*([-0-9.]+)ex/);
        if (!wM || !hM || !vbM) {
          parsed = { error: true };
        } else {
          parsed = {
            wEx: parseFloat(wM[1]),
            hEx: parseFloat(hM[1]),
            viewBox: vbM[1],
            vaEx: vaM ? parseFloat(vaM[1]) : 0,
            inner,
          };
        }
      }
      _mjxCache.set(math, parsed);
    }
  }
  if (parsed.error) {
    return renderLabelKaTeX(rawText, x, y, fontSize, fill, anchor, baseline, opacity, fontSizeCSS);
  }

  // 1ex ≈ 0.34em in TeX (x-height); fontSize is treated as em. KaTeX's .katex
  // CSS shrinks by 1.21× vs. the nominal font-size, so match that factor.
  const em = fontSizeCSS / 1.21;
  const exRatio = 0.34;
  const svgW = parsed.wEx * exRatio * em;
  const svgH = parsed.hEx * exRatio * em;

  let fx = parseFloat(x), fy = parseFloat(y);
  if (anchor === 'middle') fx -= svgW / 2;
  else if (anchor === 'end') fx -= svgW;
  fy -= svgH / 2; // vertically center — matches KaTeX foreignObject behavior

  const op = opacity != null && opacity < 1 ? ` opacity="${opacity}"` : '';
  const colorAttr = ` color="${fill || '#000000'}"`;
  // Nested <svg> must redeclare xmlns:xlink since MathJax's inner content
  // uses xlink:href (librsvg rejects undeclared namespace prefixes).
  const core = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="${fmt(fx)}" y="${fmt(fy)}" width="${fmt(svgW)}" height="${fmt(svgH)}" viewBox="${parsed.viewBox}" overflow="visible"${colorAttr}${op}>${parsed.inner}</svg>`;
  if (reflectX) {
    // Flip horizontally around the label's own center.
    const cx = fx + svgW / 2;
    return `<g transform="translate(${fmt(2*cx)},0) scale(-1,1)">${core}</g>`;
  }
  return core;
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
  // Handle \vspace{...} → remove entirely (vertical spacing)
  s = s.replace(/\\vspace\s*\{[^}]*\}/g, '');
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
    '\\cdot':'·','\\cdots':'⋯','\\ldots':'…','\\vdots':'⋮','\\ddots':'⋱','\\dots':'⋯',
    '\\le':'≤','\\leq':'≤','\\ge':'≥','\\geq':'≥',
    '\\neq':'≠','\\approx':'≈','\\equiv':'≡',
    '\\in':'∈','\\notin':'∉','\\subset':'⊂','\\supset':'⊃',
    '\\cup':'∪','\\cap':'∩','\\forall':'∀','\\exists':'∃','\\neg':'¬',
    '\\wedge':'∧','\\vee':'∨','\\oplus':'⊕','\\otimes':'⊗',
    '\\rightarrow':'\u2192','\\leftarrow':'\u2190','\\Rightarrow':'\u21D2','\\Leftarrow':'\u21D0',
    '\\longrightarrow':'\u2192','\\longleftarrow':'\u2190','\\Longrightarrow':'\u21D2','\\Longleftarrow':'\u21D0',
    '\\leftrightarrow':'\u2194','\\triangle':'\u25B3','\\angle':'\u2220','\\perp':'\u22A5',
    '\\parallel':'∥','\\circ':'∘','\\bullet':'•','\\star':'★','\\dagger':'†',
    '\\ell':'ℓ', '\\prime':'′',
    '\\cos':'cos','\\sin':'sin','\\tan':'tan','\\log':'log','\\ln':'ln',
    '\\left':'','\\right':'',
    '\\%':'%','\\#':'#','\\&':'&','\\$':'$',
  };
  // Sort by key length descending so longer commands match first (e.g. \left before \le)
  const sortedEntries = Object.entries(texMap).sort((a,b) => b[0].length - a[0].length);
  for (const [cmd, uni] of sortedEntries) {
    s = s.split(cmd).join(uni);
  }
  // Handle \<space> (TeX inter-word space), \~ (non-breaking space), \; \, \: (thin/medium space), \! (negative thin space) → space
  s = s.replace(/\\[ ~;,:!]/g, ' ');
  // Strip \definecolor{name}{model}{values} declarations (no visible output)
  s = s.replace(/\\definecolor\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}/g, '');
  // Strip \color{name} commands, keeping surrounding text
  s = s.replace(/\\color\s*\{[^}]*\}/g, '');
  // Strip \rm (font switch, not braced form)
  s = s.replace(/\\rm\b/g, '');
  // Handle font-wrapper commands (\mathbf, \mathrm, etc.) — remove command, keep content.
  // In math mode, spaces between these commands are ignored (e.g. \mathbf{C} \mathbf{i} → Ci).
  s = s.replace(/\\(?:mathbf|mathrm|mathit|mathsf|mathtt|textbf|textit|textrm|text|operatorname)\s*\{([^}]*)\}/g, '$1');
  // Handle accent commands: \vec{X} → X⃗, \hat{X} → X̂, \bar{X} → X̄, etc.
  s = s.replace(/\\vec\s*\{([^}]*)\}/g, '$1\u20D7');
  s = s.replace(/\\hat\s*\{([^}]*)\}/g, '$1\u0302');
  s = s.replace(/\\bar\s*\{([^}]*)\}/g, '$1\u0304');
  s = s.replace(/\\tilde\s*\{([^}]*)\}/g, '$1\u0303');
  s = s.replace(/\\dot\s*\{([^}]*)\}/g, '$1\u0307');
  s = s.replace(/\\ddot\s*\{([^}]*)\}/g, '$1\u0308');
  s = s.replace(/\\overline\s*\{([^}]*)\}/g, '$1\u0305');
  s = s.replace(/\\underline\s*\{([^}]*)\}/g, '$1\u0332');
  s = s.replace(/\\overrightarrow\s*\{([^}]*)\}/g, '$1\u20D7');
  // Remove remaining \command sequences
  s = s.replace(/\\[a-zA-Z]+/g, '');
  // Remove braces
  s = s.replace(/[{}]/g, '');
  // Convert ^{...} and _{...} to Unicode superscripts/subscripts
  const superMap = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
    '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ','a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ',
    'e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','o':'ᵒ','p':'ᵖ',
    'r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ'};
  const subMap = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
    '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ',
    'k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ',
    'v':'ᵥ','x':'ₓ'};
  function toSuper(ch) { return superMap[ch] || ch; }
  function toSub(ch) { return subMap[ch] || ch; }
  // ^{multi} and _{multi}
  s = s.replace(/\^{([^}]*)}/g, (_, g) => [...g].map(toSuper).join(''));
  s = s.replace(/_{([^}]*)}/g, (_, g) => [...g].map(toSub).join(''));
  // ^single and _single character
  s = s.replace(/\^(.)/g, (_, ch) => toSuper(ch));
  s = s.replace(/_(.)/g, (_, ch) => toSub(ch));
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
    } else if (seg.type === 'sqrt') {
      const innerText = stripLaTeX(seg.content);
      const innerW = _estimateTextWidth(innerText, fontSize);
      const sqrtPad = fontSize * 0.25; // padding around content
      const radicalW = fontSize * 0.55; // width of the radical sign
      const totalSqrtW = radicalW + innerW + sqrtPad;
      parts.push({type:'sqrt', innerText, innerW, radicalW, width: totalSqrtW});
      totalWidth += totalSqrtW;
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
      els.push(`<text x="${fmt(cx)}" y="${fmt(y - fontSize*0.35)}" fill="${fill}" font-size="${fmt(p.fracFontSize)}" text-anchor="middle" dominant-baseline="central" font-family="KaTeX_Main, serif"${opAttr}>${escSvg(p.numText)}</text>`);
      // Fraction line
      els.push(`<line x1="${fmt(curX + fontSize*0.1)}" y1="${fmt(y - fontSize*0.05)}" x2="${fmt(curX + p.width - fontSize*0.1)}" y2="${fmt(y - fontSize*0.05)}" stroke="${fill}" stroke-width="0.7"${opAttr}/>`);
      // Denominator below line
      els.push(`<text x="${fmt(cx)}" y="${fmt(y + fontSize*0.35)}" fill="${fill}" font-size="${fmt(p.fracFontSize)}" text-anchor="middle" dominant-baseline="central" font-family="KaTeX_Main, serif"${opAttr}>${escSvg(p.denText)}</text>`);
    } else if (p.type === 'sqrt') {
      // Draw radical sign: a check-mark shape leading into a horizontal overline
      const topY = y - fontSize * 0.5;   // top of the radical
      const botY = y + fontSize * 0.4;   // bottom of the check mark
      const overlineY = topY - fontSize * 0.05; // overline just above top
      const radX0 = curX;                // start of radical
      const radX1 = curX + p.radicalW * 0.35; // bottom of the check-mark notch
      const radX2 = curX + p.radicalW;   // where the overline starts (top of check)
      const overlineEnd = curX + p.width; // end of overline over content
      const sw = Math.max(0.6, fontSize * 0.05); // stroke width
      // Radical sign path: small top-left tick → down to bottom → up to overline start → horizontal overline
      els.push(`<path d="M${fmt(radX0)},${fmt(y - fontSize*0.05)} L${fmt(radX1)},${fmt(botY)} L${fmt(radX2)},${fmt(overlineY)} L${fmt(overlineEnd)},${fmt(overlineY)}" fill="none" stroke="${fill}" stroke-width="${fmt(sw)}" stroke-linecap="round" stroke-linejoin="round"${opAttr}/>`);
      // Content text after radical sign
      const textX = curX + p.radicalW;
      els.push(`<text x="${fmt(textX)}" y="${fmt(y)}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="start" dominant-baseline="central" font-family="KaTeX_Main, serif"${opAttr}>${escSvg(p.innerText)}</text>`);
    } else if (p.type === 'underbrace') {
      const cx = curX + p.width / 2;
      const by = y + fontSize * 0.3;
      const bh = fontSize * 0.4;
      // Underbrace as a path: left arm → center dip → right arm
      els.push(`<path d="M${fmt(curX)},${fmt(by)} Q${fmt(curX)},${fmt(by+bh)} ${fmt(cx)},${fmt(by+bh)} Q${fmt(curX+p.width)},${fmt(by+bh)} ${fmt(curX+p.width)},${fmt(by)}" fill="none" stroke="${fill}" stroke-width="0.7"${opAttr}/>`);
      if (p.labelText) {
        els.push(`<text x="${fmt(cx)}" y="${fmt(by + bh + fontSize*0.7)}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="middle" dominant-baseline="central" font-family="KaTeX_Main, serif"${opAttr}>${escSvg(p.labelText)}</text>`);
      }
    } else {
      els.push(`<text x="${fmt(curX)}" y="${fmt(y)}" fill="${fill}" font-size="${fmt(fontSize)}" text-anchor="start" dominant-baseline="central" font-family="KaTeX_Main, serif"${opAttr}>${escSvg(p.text)}</text>`);
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
    // Find next \frac, \underbrace, or \sqrt
    const fracIdx = remaining.indexOf('\\frac');
    const ubIdx = remaining.indexOf('\\underbrace');
    const sqrtIdx = remaining.indexOf('\\sqrt');
    const candidates = [];
    if (fracIdx >= 0) candidates.push({idx: fracIdx, type: 'frac'});
    if (ubIdx >= 0) candidates.push({idx: ubIdx, type: 'underbrace'});
    if (sqrtIdx >= 0) candidates.push({idx: sqrtIdx, type: 'sqrt'});
    candidates.sort((a, b) => a.idx - b.idx);
    let nextIdx = -1, nextType = '';
    if (candidates.length > 0) { nextIdx = candidates[0].idx; nextType = candidates[0].type; }
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
    } else if (nextType === 'sqrt') {
      remaining = remaining.substring(nextIdx + 5); // skip \sqrt
      const content = extractBraced(remaining);
      remaining = remaining.substring(content.consumed);
      segments.push({type:'sqrt', content: content.content});
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
  // Strip comments before checking so keywords in comments don't cause false positives
  const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Reject features we can't handle
  if (/\bstruct\b/.test(stripped)) return false;
  // 3D wireframe and basic surface() are supported
  if (/\bimport\s+flowchart\b/.test(stripped)) return false;
  if (/\bimport\s+animation\b/.test(stripped)) return false;
  // import palette is now accepted (palette/Rainbow/Gradient stubs installed)
  if (/\bfile\b/.test(stripped) && /\binput\b/.test(stripped)) return false;
  // settings.render etc. are now accepted (silently ignored)
  // texpath is now accepted (stub returns empty path array)
  if (/\bshipout\b/.test(stripped)) return false;
  // graphic() is now supported via pre-fetched image cache
  // picture support is now implemented
  // Accept everything else
  return true;
}

function render(code, opts) {
  const interp = createInterpreter();
  const result = interp.execute(code, opts);
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
