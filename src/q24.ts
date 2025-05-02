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
  makeEmptySExp,
  makeSymbolSExp,
  SExpValue,
} from "./L32/L32-value";

//DictExp → AppExp converter with dict and quote of a list of pairs
export const convertDictExp = (exp: DictExp): CExp =>
  makeAppExp(makeVarRef("dict"), [
    makeLitExp(
      exp.entries
        .map(({ key, val }) =>
          makeCompoundSExp(makeSymbolSExp(key), convertCExpToLit(val))
        )
        .reduceRight<SExpValue>(
          (pair, acc) => makeCompoundSExp(pair, acc),
          makeEmptySExp()
        )
    ),
  ]);

const convertCExpToLit = (val: CExp): any =>
  isLitExp(val)
    ? val.val
    : isNumExp(val)
    ? val.val
    : isBoolExp(val)
    ? val.val
    : isStrExp(val)
    ? val.val
    : isPrimOp(val)
    ? val
    : isVarRef(val)
    ? makeSymbolSExp(val.var)
    : makeSymbolSExp("unknown"); // fallback for safety

// Converts a regular CExp expression while only handling DictExp
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

export const L32toL3 = (prog: Program): Program =>
  makeProgram(
    Dict2App(prog).exps.map((e: Exp) =>
      isDefineExp(e) ? { ...e, val: L32toL3CExp(e.val) } : L32toL3CExp(e)
    )
  );

/*
Purpose: rewrite all occurrences of DictExp in a program to AppExp.
Signature: Dict2App (exp)
Type: Program -> Program
*/
/*export const Dict2App  = (exp: Program) : Program =>
    //@TODO
    makeProgram([]);*/

/*
Purpose: Transform L32 program to L3
Signature: L32ToL3(prog)
Type: Program -> Program

export const L32toL3 = (prog: Program): Program =>
  //@TODO
  makeProgram([]);
function makeFailure(arg0: string) {
  throw new Error("Function not implemented.");
}*/
