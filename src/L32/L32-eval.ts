// L32-eval.ts
import { map } from "ramda";
import { isCExp, isLetExp } from "./L32-ast";
import {
  BoolExp,
  CExp,
  Exp,
  IfExp,
  LitExp,
  NumExp,
  PrimOp,
  ProcExp,
  Program,
  StrExp,
  VarDecl,
} from "./L32-ast";
import {
  isAppExp,
  isBoolExp,
  isDefineExp,
  isIfExp,
  isLitExp,
  isNumExp,
  isPrimOp,
  isProcExp,
  isStrExp,
  isVarRef,
} from "./L32-ast";
import {
  makeBoolExp,
  makeLitExp,
  makeNumExp,
  makeProcExp,
  makeStrExp,
} from "./L32-ast";
import { parseL32Exp } from "./L32-ast";
import { applyEnv, makeEmptyEnv, makeEnv, Env } from "./L32-env";
import {
  isClosure,
  makeClosure,
  Closure,
  Value,
  makeCompoundSExp,
  makeSymbolSExp,
  makeEmptySExp,
  isDictValue,
  DictValue,
  isSymbolSExp,
} from "./L32-value";
import { first, rest, isEmpty, List, isNonEmptyList } from "../shared/list";
import { isBoolean, isNumber, isString } from "../shared/type-predicates";
import {
  Result,
  makeOk,
  makeFailure,
  bind,
  mapResult,
  mapv,
} from "../shared/result";
import { renameExps, substitute } from "./substitute";
import { applyPrimitive } from "./evalPrimitive";
import { parse as p } from "../shared/parser";
import { Sexp } from "s-expression";
import { format } from "../shared/format";

import { DictExp, DictEntry, isDictExp } from "./L32-ast";
import { makeDict } from "./L32-value";
// ========================================================
// Eval functions

const L32applicativeEval = (exp: CExp, env: Env): Result<Value> =>
  isNumExp(exp)
    ? makeOk(exp.val)
    : isBoolExp(exp)
    ? makeOk(exp.val)
    : isStrExp(exp)
    ? makeOk(exp.val)
    : isPrimOp(exp)
    ? makeOk(exp)
    : isVarRef(exp)
    ? applyEnv(env, exp.var)
    : isLitExp(exp)
    ? makeOk(exp.val)
    : isIfExp(exp)
    ? evalIf(exp, env)
    : isProcExp(exp)
    ? evalProc(exp, env)
    : isAppExp(exp)
    ? bind(L32applicativeEval(exp.rator, env), (rator: Value) =>
        bind(
          mapResult((param) => L32applicativeEval(param, env), exp.rands),
          (rands: Value[]) => L32applyProcedure(rator, rands, env)
        )
      )
    : isLetExp(exp)
    ? makeFailure('"let" not supported (yet)')
    : isDictExp(exp)
    ? evalDict(exp, env)
    : exp;

export const isTrueValue = (x: Value): boolean => !(x === false);

const evalIf = (exp: IfExp, env: Env): Result<Value> =>
  bind(L32applicativeEval(exp.test, env), (test: Value) =>
    isTrueValue(test)
      ? L32applicativeEval(exp.then, env)
      : L32applicativeEval(exp.alt, env)
  );

const evalProc = (exp: ProcExp, env: Env): Result<Closure> =>
  makeOk(makeClosure(exp.args, exp.body));

const L32applyProcedure = (
  proc: Value,
  args: Value[],
  env: Env
): Result<Value> =>
  isPrimOp(proc)
    ? applyPrimitive(proc, args)
    : isClosure(proc)
    ? applyClosure(proc, args, env)
    : isDictValue(proc)
    ? applyDict(proc, args)
    : makeFailure(`Bad procedure ${format(proc)}`);

// Applications are computed by substituting computed
// values into the body of the closure.
// To make the types fit - computed values of params must be
// turned back in Literal Expressions that eval to the computed value.
const valueToLitExp = (
  v: Value
): NumExp | BoolExp | StrExp | LitExp | PrimOp | ProcExp =>
  isNumber(v)
    ? makeNumExp(v)
    : isBoolean(v)
    ? makeBoolExp(v)
    : isString(v)
    ? makeStrExp(v)
    : isPrimOp(v)
    ? v
    : isClosure(v)
    ? makeProcExp(v.params, v.body)
    : makeLitExp(v);

const applyClosure = (
  proc: Closure,
  args: Value[],
  env: Env
): Result<Value> => {
  const vars = map((v: VarDecl) => v.var, proc.params);
  const body = renameExps(proc.body);
  const litArgs = map(valueToLitExp, args);
  return evalSequence(substitute(body, vars, litArgs), env);
};

//Added dict here
const applyDict = (dict: DictValue, args: Value[]): Result<Value> => {
  if (args.length !== 1) {
    return makeFailure(`Dict expects one argument`);
  }

  const key = extractKey(args[0]);
  return key !== undefined
    ? lookupKey(dict, key)
    : makeFailure(`Dict key must be string or symbol`);
};

const lookupKey = (dict: DictValue, key: string): Result<Value> => {
  const entry = dict.entries.find((e) => e.key === key);
  return entry ? makeOk(entry.val) : makeFailure(`Key not found: ${key}`);
};

const extractKey = (v: Value): string | undefined =>
  typeof v === "string" ? v : isSymbolSExp(v) ? v.val : undefined;

// Evaluate a sequence of expressions (in a program)
export const evalSequence = (seq: List<Exp>, env: Env): Result<Value> =>
  isNonEmptyList<Exp>(seq)
    ? isDefineExp(first(seq))
      ? evalDefineExps(first(seq), rest(seq), env)
      : evalCExps(first(seq), rest(seq), env)
    : makeFailure("Empty sequence");

const evalCExps = (first: Exp, rest: Exp[], env: Env): Result<Value> =>
  isCExp(first) && isEmpty(rest)
    ? L32applicativeEval(first, env)
    : isCExp(first)
    ? bind(L32applicativeEval(first, env), (_) => evalSequence(rest, env))
    : makeFailure("Never");

// Eval a sequence of expressions when the first exp is a Define.
// Compute the rhs of the define, extend the env with the new binding
// then compute the rest of the exps in the new env.
const evalDefineExps = (def: Exp, exps: Exp[], env: Env): Result<Value> =>
  isDefineExp(def)
    ? bind(L32applicativeEval(def.val, env), (rhs: Value) =>
        evalSequence(exps, makeEnv(def.var.var, rhs, env))
      )
    : makeFailure(`Unexpected in evalDefine: ${format(def)}`);

// Main program
export const evalL32program = (program: Program): Result<Value> =>
  evalSequence(program.exps, makeEmptyEnv());

export const evalParse = (s: string): Result<Value> =>
  bind(p(s), (sexp: Sexp) =>
    bind(parseL32Exp(sexp), (exp: Exp) => evalSequence([exp], makeEmptyEnv()))
  );

// Added dict here
const evalDict = (dict: DictExp, env: Env): Result<Value> =>
  mapv(
    mapResult(
      (entry: DictEntry) =>
        bind(L32applicativeEval(entry.val, env), (v: Value) =>
          makeOk({ key: entry.key, val: v })
        ),
      dict.entries
    ),
    makeDict
  );
