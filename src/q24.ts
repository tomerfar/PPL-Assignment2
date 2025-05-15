import {
  Binding,
  CExp,
  Exp,
  isAppExp,
  isAtomicExp,
  isDefineExp,
  isIfExp,
  isLetExp,
  isLitExp,
  isProcExp,
  makeAppExp,
  makeLitExp,
  makePrimOp,
  makeProgram,
  makeVarRef,
  Program,
  DictExp,
  isDictExp,
  isNumExp,
  isBoolExp,
  isStrExp,
  isPrimOp,
  isVarRef,
  makeDefineExp,
  makeVarDecl,
  makeIfExp,
  makeProcExp,
} from "./L32/L32-ast";
import {
  makeCompoundSExp,
  makeDict,
  makeEmptySExp,
  makeSymbolSExp,
  SExpValue,
} from "./L32/L32-value";

//Converts a DictExp to a LitExp containing a DictValue, creates a makeDict from the entries, each value is mapped by convertCExpToLit
//and the result is packed in a LitExp using makeLitExp
export const convertDictExp = (exp: DictExp): CExp =>
  makeLitExp(
    makeDict(
      exp.entries.map(({ key, val }) => ({
        key,
        val: convertCExpToLit(val),
      }))
    )
  );

// Accepts a CExp expression and returns its literal representation as an SExpValue (Scheme S-expression),
// to be incorporated into the DictValue
const convertCExpToLit = (exp: CExp): SExpValue =>
  //Literal expressions: return the literal value directly
  isLitExp(exp)
    ? (exp.val as SExpValue)
    : //Numeric, boolean, and string atomic expressions
    isNumExp(exp)
    ? exp.val
    : isBoolExp(exp)
    ? exp.val
    : isStrExp(exp)
    ? exp.val
    : //Primitive operations and variable references: convert to symbol S-expressions
    isPrimOp(exp)
    ? makeSymbolSExp(exp.op)
    : isVarRef(exp)
    ? makeSymbolSExp(exp.var)
    : //Application expressions: build a list '(rator rand1 rand2 ...)
    isAppExp(exp)
    ? [exp.rator, ...exp.rands]
        .map(convertCExpToLit)
        .reduceRight<SExpValue>(
          (tail, head) => makeCompoundSExp(head, tail),
          makeEmptySExp()
        )
    : //Lambda expressions: convert to '(lambda (args...) body...),
    // first builds a parameter list, converts each body expression, unifies it into a list of complications.
    isProcExp(exp)
    ? (() => {
        const lambdaSym = makeSymbolSExp("lambda");
        // Build the parameter list
        const argsList = exp.args
          .map((decl) => makeSymbolSExp(decl.var))
          .reduceRight<SExpValue>(
            (tail, head) => makeCompoundSExp(head, tail),
            makeEmptySExp()
          );
        // Convert each body expression
        const bodyItems = exp.body.map(convertCExpToLit);
        // Combine into a single list: (lambda argsList ...bodyItems)
        const items: SExpValue[] = [lambdaSym, argsList, ...bodyItems];
        return items.reduceRight<SExpValue>(
          (tail, head) => makeCompoundSExp(head, tail),
          makeEmptySExp()
        );
      })()
    : //Nested dictionary expressions: convert to '(dict (k1 . v1) (k2 . v2) ...)
    isDictExp(exp)
    ? (() => {
        const dictSym = makeSymbolSExp("dict");
        const entryLists: SExpValue[] = exp.entries.map(({ key, val }) => {
          const k = makeSymbolSExp(key);
          const v = convertCExpToLit(val);
          // Build a dotted pair (k . v)
          return makeCompoundSExp(k, makeCompoundSExp(v, makeEmptySExp()));
        });
        const items: SExpValue[] = [dictSym, ...entryLists];
        return items.reduceRight<SExpValue>(
          (tail, head) => makeCompoundSExp(head, tail),
          makeEmptySExp()
        );
      })()
    : // If we reach here, we don't know how to convert exp to a literal
      (() => {
        throw new Error(
          `Cannot convert CExp to literal: ${JSON.stringify(exp)}`
        );
      })();

// Iterates over all CExp structures and only replaces the DictExp using convertDictExp
// The rest of the nodes are preserved or recursed in.
const Dict2AppCExp = (e: CExp): CExp =>
  isAtomicExp(e)
    ? e
    : isIfExp(e)
    ? {
        ...e,
        test: Dict2AppCExp(e.test),
        then: Dict2AppCExp(e.then),
        alt: Dict2AppCExp(e.alt),
      }
    : isProcExp(e)
    ? { ...e, body: e.body.map(Dict2AppCExp) }
    : isAppExp(e)
    ? { ...e, rator: Dict2AppCExp(e.rator), rands: e.rands.map(Dict2AppCExp) }
    : isLetExp(e)
    ? {
        ...e,
        bindings: e.bindings.map((b: Binding) => ({
          ...b,
          val: Dict2AppCExp(b.val),
        })),
        body: e.body.map(Dict2AppCExp),
      }
    : isLitExp(e)
    ? e
    : isDictExp(e)
    ? convertDictExp(e)
    : e;

// A main function that performs a transformation on any program
//Converts each DictExp in the AST to a LitExp of DictValue, leaving the rest of the CExp as they were

/*
Purpose: rewrite all occurrences of DictExp in a program to AppExp.
Signature: Dict2App (exp)
Type: Program -> Program
*/
export const Dict2App = (prog: Program): Program =>
  makeProgram(
    prog.exps.map((e: Exp) =>
      isDefineExp(e) ? { ...e, val: Dict2AppCExp(e.val) } : Dict2AppCExp(e)
    )
  );

//////////////////////////////////////////////////////////////////

const L32toL3CExp = (exp: CExp): CExp =>
  isAtomicExp(exp)
    ? exp
    : isIfExp(exp)
    ? makeIfExp(
        L32toL3CExp(exp.test),
        L32toL3CExp(exp.then),
        L32toL3CExp(exp.alt)
      )
    : isProcExp(exp)
    ? makeProcExp(exp.args, exp.body.map(L32toL3CExp))
    : isAppExp(exp)
    ? isVarRef(exp.rator) && exp.rator.var === "get" && exp.rands.length === 2
      ? makeAppExp(L32toL3CExp(exp.rands[0]), [L32toL3CExp(exp.rands[1])])
      : makeAppExp(L32toL3CExp(exp.rator), exp.rands.map(L32toL3CExp))
    : isLetExp(exp)
    ? {
        ...exp,
        bindings: exp.bindings.map((b: Binding) => ({
          ...b,
          val: L32toL3CExp(b.val),
        })),
        body: exp.body.map(L32toL3CExp),
      }
    : exp;

//First calls Dict2App(prog) to convert each DictExp to a LitExp of DictValue, then
//applies the result to each Exp expression with the L32 to L3 conversion by L32toL3CExp and packs back in makeProgram

/*
Purpose: Transform L32 program to L3
Signature: L32ToL3(prog)
Type: Program -> Program
*/
export const L32toL3 = (prog: Program): Program =>
  makeProgram(
    Dict2App(prog).exps.map((e: Exp) =>
      isDefineExp(e) ? { ...e, val: L32toL3CExp(e.val) } : L32toL3CExp(e)
    )
  );
