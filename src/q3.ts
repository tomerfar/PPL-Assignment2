import {
  Exp,
  isAppExp,
  isProcExp,
  isProgram,
  isStrExp,
  isBoolExp,
  isDefineExp,
  isIfExp,
  isNumExp,
  isPrimOp,
  isVarRef,
  ProcExp,
  Program,
  IfExp,
  AppExp,
  DefineExp,
} from "./L3/L3-ast";
import { Result, makeFailure, makeOk, mapResult, bind } from "./shared/result";

/*
  Purpose: Transform L2 AST to JavaScript program string
  Signature: l2ToJS(l2AST)
  Type: [EXP | Program] => Result<string>
  */

export const l2ToJS = (exp: Exp | Program): Result<string> =>
  isProgram(exp) ? handleProgram(exp) : l2ToJSExp(exp);

export const l2ToJSExp = (exp: Exp): Result<string> =>
  isBoolExp(exp)
    ? makeOk(exp.val ? "true" : "false")
    : isNumExp(exp)
    ? makeOk(exp.val.toString())
    : isStrExp(exp)
    ? makeOk(`"${exp.val}"`)
    : isVarRef(exp)
    ? makeOk(exp.var)
    : isPrimOp(exp)
    ? makeOk(convertPrimOp(exp.op))
    : isProcExp(exp)
    ? handleProcExp(exp)
    : isIfExp(exp)
    ? handleIfExp(exp)
    : isAppExp(exp)
    ? handleAppExp(exp)
    : isDefineExp(exp)
    ? handleDefineExp(exp)
    : makeFailure("Unsupported Expression");

// Handlers
const convertPrimOp = (op: string): string =>
  op === "=" || op === "eq?" || op === "boolean?" || op === "number?"
    ? "==="
    : op === "and"
    ? "&&"
    : op === "or"
    ? "||"
    : op === "not"
    ? "!"
    : op; // default for + , - , *, /, < , > , =

const handleProcExp = (pe: ProcExp): Result<string> =>
  pe.body.length === 1
    ? bind(l2ToJSExp(pe.body[0]), (bodyJS) =>
        makeOk(`((${pe.args.map((p) => p.var).join(",")}) => ${bodyJS})`)
      )
    : makeFailure("Lambda with multiple expressions in body is not supported");

const handleIfExp = (exp: IfExp): Result<string> =>
  bind(l2ToJSExp(exp.test), (testJs) =>
    bind(l2ToJSExp(exp.then), (thenJS) =>
      bind(l2ToJSExp(exp.alt), (altJs) =>
        makeOk(`(${testJs} ? ${thenJS} : ${altJs})`)
      )
    )
  );

const handleAppExp = (exp: AppExp): Result<string> => {
  const rator = exp.rator;

  return isPrimOp(rator)
    ? exp.rands.length >= 1
      ? bind(mapResult(l2ToJSExp, exp.rands), (argsJS) =>
          rator.op === "not" && argsJS.length === 1
            ? makeOk(`(!${argsJS[0]})`)
            : makeOk(`(${argsJS.join(` ${convertPrimOp(rator.op)} `)})`)
        )
      : makeFailure(`Primitive operation '${rator.op}' expects arguments`)
    : bind(l2ToJSExp(rator), (ratorJS) =>
        bind(mapResult(l2ToJSExp, exp.rands), (argsJS) =>
          makeOk(`${ratorJS}(${argsJS.join(",")})`)
        )
      );
};

const handleDefineExp = (exp: DefineExp): Result<string> =>
  bind(l2ToJSExp(exp.val), (valJS) =>
    makeOk(`const ${exp.var.var} = ${valJS}`)
  );

const handleProgram = (program: Program): Result<string> =>
  bind(mapResult(l2ToJSExp, program.exps), (lines: string[]) =>
    makeOk(
      lines
        .map((line, i) => (i < lines.length - 1 ? `${line};` : line))
        .join("\n")
    )
  );
