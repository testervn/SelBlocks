// To use Selblocks commands in Selenium Server, provide this file on the command line.
// Eg: -userExtensions "C:\somewhere\user-extensions.js"

// ================================================================================
// from: name-space.js

// SelBlocks name-space
var selblocks = {
   name: "selblocks"
  ,seleniumEnv: "ide"
  ,globalContext: this // alias for global Selenium scope
};

(function($$){
  $$.fn = {};

  /* Starting with FF4 lots of objects are in an XPCNativeWrapper,
   * and we need the underlying object for == and for..in operations.
   */
  $$.unwrapObject = function(obj) {
    if (typeof(obj) === "undefined" || obj == null)
      return obj;
    if (obj.wrappedJSObject)
      return obj.wrappedJSObject;
    return obj;
  };

  $$.fmtCmd = function(cmd) {
    var c = cmd.command;
    if (cmd.target) { c += "|" + cmd.target; }
    if (cmd.value)  { c += "|" + cmd.value; }
    return c;
  }

}(selblocks));

// ================================================================================
// from: logger.js

// selbocks name-space
(function($$){

  /* LOG wrapper for SelBlocks-specific behavior
   */
  function Logger()
  {
    this.error = function (msg) { this.logit("error", msg); };
    this.warn  = function (msg) { this.logit("warn", msg); };
    this.info  = function (msg) { this.logit("info", msg); };
    this.debug = function (msg) { this.logit("debug", msg); };
    this.trace = function (msg) { this.logit("debug", msg); }; // selenium doesn't have trace level

    this.logit = function (logLevel, msg) {
      LOG[logLevel]("[" + $$.name + "] " + msg);  // call the Selenium logger
    };

    // ==================== Stack Tracer ====================

    this.genStackTrace = function(err)
    {
      var e = err || new Error();
      var stackTrace = [];
      if (!e.stack)
        stackTrace.push("No stack trace, (Firefox only)");
      else {
        var funcCallPattern = /^\s*[A-Za-z0-9\-_\$]+\(/;
        var lines = e.stack.split("\n");
        for (var i=0; i < lines.length; i++) {
          if (lines[i].match(funcCallPattern))
            stackTrace.push(lines[i]);
        }
        if (!err)
          stackTrace.shift(); // remove the call to genStackTrace() itself
      }
      return stackTrace;
    };

    this.logStackTrace = function(err)
    {
      var t = this.genStackTrace(err);
      if (!err)
        t.shift(); // remove the call to logStackTrace() itself
      this.warn("__Stack Trace__");
      for (var i = 0; i < t.length; i++) {
        this.warn("@@ " + t[i]);
      }
    };

    // describe the calling function
    this.descCaller = function()
    {
      var t = this.genStackTrace(new Error());
      if (t.length == 0) return "no client function";
      t.shift(); // remove the call to descCaller() itself
      if (t.length == 0) return "no caller function";
      t.shift(); // remove the call to client function
      if (t.length == 0) return "undefined caller function";
      return "caller: " + t[0];
    };
  }

  $$.LOG = new Logger();

}(selblocks));

// ================================================================================
// from: expression-parser.js

/** Parse basic expressions.
*/
// selbocks name-space
(function($$){

  $$.InfixExpressionParser =
  {
    _objname : "InfixExpressionParser"
    ,BRACKET_PAIRS : { "(": ")", "{": "}", "[": "]" }
    ,trimListValues : true

    //- Parse a string into a list on the given delimiter character,
    // respecting embedded quotes and brackets
    ,splitList : function(str, delim)
    {
      var values = [];
      var prev = 0, cur = 0;
      while (cur < str.length) {
        if (str.charAt(cur) != delim) {
          cur = this.spanSub(str, cur);
          if (cur == -1)
            throw new Error("Unbalanced expression grouping at: " + str.substr(prev));
        }
        else {
          var value = str.substring(prev, cur);
          if (this.trimListValues)
            value = value.trim();
          values.push(value);
          prev = cur + 1;
        }
        cur++;
      }
      values.push(str.substring(prev));
      if (values.length == 1 && values[0].trim() == "") {
        values.length = 0;
      }
      return values;
    }

    //- Scan to the given chr, skipping over intervening matching brackets
    ,spanTo : function(str, i, chr)
    {
      while (str.charAt(i) != chr) {
        i = this.spanSub(str, i);
        if (i == -1 || i >= str.length)
          return -1;
        i++;
      }
      return i;
    }

    //- If character at the given index is a open/quote character, then scan to its matching close/quote
    ,spanSub : function(str, i)
    {
      if (i < str.length) {
        if (str.charAt(i) == "(") return this.spanTo(str, i+1, ")"); // recursively skip over intervening matching brackets
        else if (str.charAt(i) == "[") return this.spanTo(str, i+1, "]");
        else if (str.charAt(i) == "{") return this.spanTo(str, i+1, "}");
        else if (str.charAt(i) == "'") return str.indexOf("'", i+1); // no special meaning for intervening brackets
        else if (str.charAt(i) == '"') return str.indexOf('"', i+1);
      }
      return i;
    }

    //- Format the given values array into a delimited list string
    // An optional transformFunc operates on each value.
    ,formatList : function(delim, values, left, transformFunc, right)
    {
      var buf = "";
      for (var i = 0; i < values.length; i++) {
        var value = ((transformFunc) ? transformFunc(values[i], i) : values[i]);
        if (buf)   buf += delim || " ";
        if (left)  buf += left;
        if (value) buf += value;
        if (right) buf += right;
      }
      return buf;
    }
  };

}(selblocks));

// ================================================================================
// from: function-intercepting.js

// selbocks name-space
(function($$){

  /* Function interception
  */

  // execute the given function before each call of the specified function
  $$.fn.interceptBefore = function(targetObj, targetFnName, _fn) {
    var existing_fn = targetObj[targetFnName];
    targetObj[targetFnName] = function() {
      _fn.call(this);
      return existing_fn.call(this);
    };
  };
  // execute the given function after each call of the specified function name
  $$.fn.interceptAfter = function(targetObj, targetFnName, _fnAfter) {
    var existing_fn = targetObj[targetFnName];
    targetObj[targetFnName] = function() {
      var args = Array.prototype.slice.call(arguments);
      existing_fn.apply(this, args);
      return _fnAfter.apply(this, args);
    };
  };
  // replace the specified function with the given function
  $$.fn.interceptReplace = function(targetObj, targetFnName, _fn) {
    targetObj[targetFnName] = function() {
      //var existing_fn = targetObj[targetFnName] = _fn;
      return _fn.call(this);
    };
  };

  $$.fn.interceptStack = [];

  // replace the specified function, saving the original function on a stack
  $$.fn.interceptPush = function(targetObj, targetFnName, _fnTemp, frameAttrs) {
    var frame = {
       targetObj: targetObj
      ,targetFnName: targetFnName
      ,savedFn: targetObj[targetFnName]
      ,attrs: frameAttrs
    };
    $$.fn.interceptStack.push(frame);
    targetObj[targetFnName] = _fnTemp;
  };
  // restore the most recent function replacement
  $$.fn.interceptPop = function() {
    var frame = $$.fn.interceptStack.pop();
    frame.targetObj[frame.targetFnName] = frame.savedFn;
  };

  $$.fn.getInterceptTop = function() {
    return $$.fn.interceptStack[$$.fn.interceptStack.length-1];
  };

  // replace the specified function, but then restore the original function as soon as it is call
  $$.fn.interceptOnce = function(targetObj, targetFnName, _fn) {
    $$.fn.interceptPush(targetObj, targetFnName, function(){
      $$.fn.interceptPop(); // un-intercept
      var args = Array.prototype.slice.call(arguments);
      _fn.apply(this, args);
    });
  };

}(selblocks));

// ================================================================================
// from: user-extensions-base.js

/*jslint
 indent:2
,maxerr:500
,plusplus:true
,white:true
,nomen:true
*/
/*globals
Selenium:true,
htmlTestRunner:true
*/
(function($$){
  $$.seleniumEnv = "server";
  // this flag is global so that SelBlocks and SelBench can be used together
  $$.globalContext.serverPatchApplied = $$.globalContext.serverPatchApplied || false;

  if (!$$.globalContext.serverPatchApplied) {
    $$.LOG.info("Applying testCase server patch for " + $$.name);
    $$.fn.interceptAfter(Selenium.prototype, "reset", initTestCase);
    $$.globalContext.serverPatchApplied = true;
  }

  // Selenium Core does not have the testCase object
  // but the currentTest object can be extended for our purposes
  function initTestCase()
  {
    if (!(typeof htmlTestRunner === "undefined" || htmlTestRunner === null)) {
      // TBD: map commands to real types instead of faking it
      htmlTestRunner.currentTest.commands = mapCommands(htmlTestRunner.currentTest.htmlTestCase.getCommandRows());
      $$.globalContext.testCase = htmlTestRunner.currentTest;
      // debugContext isn't on this object, but redirecting to the currentTest seems to work
      $$.globalContext.testCase.debugContext = htmlTestRunner.currentTest;
      // define pseudo properties with getters/setters on a hidden property,
      // so that they both maintain the same value.
      Object.defineProperties($$.globalContext.testCase, {
        "_nextCommandRowIndex" : {
          writable : true
        }
        ,"debugIndex" : { // for IDE
          enumerable : true
          ,get : function () { return this._nextCommandRowIndex; }
          ,set : function (idx) { this._nextCommandRowIndex = idx; }
        }
        ,"nextCommandRowIndex" : { // for Selenium Server
          enumerable : true
          ,get : function () { return this._nextCommandRowIndex; }
          ,set : function (idx) { this._nextCommandRowIndex = idx; }
        }
      });
    }

    function mapCommands(cmdRows) {
      var mappedCmds = [];
      for (var i = 0; i < cmdRows.length; ++i) {
        mappedCmds.push(importCommand(cmdRows[i]));
      }
      return mappedCmds;
    }

    function importCommand(cmdRow) {
      var cmd = cmdRow.getCommand();
      if (cmdRow.hasOwnProperty("trElement")) {
        cmd.type = "command";
      } else {
        cmd.type = "comment";
      }
      return cmd;
    }
  }
}(selblocks));
// ================================================================================
// from: selblocks.js

/*
 * SelBlocks 2.1
 *
 * Provides commands for Javascript-like looping and callable functions,
 *   with scoped variables, and JSON/XML driven parameterization.
 *
 * (SelBlocks installs as a Core Extension, not an IDE Extension, because it manipulates the Selenium object)
 *
 * Concept of operation:
 *  - Selenium.reset() is intercepted to initialize the block structures.
 *  - testCase.nextCommand() is overridden for flow branching.
 *  - TestLoop.resume() is overridden by exitTest, and by try/catch/finally to manage the outcome of errors.
 *  - The static structure of command blocks is stored in blockDefs[] by script line number.
 *    E.g., ifDef has pointers to its corresponding elseIf, else, endIf commands.
 *  - The state of each function-call is pushed/popped on callStack as it begins/ends execution
 *    The state of each block is pushed/popped on the blockStack as it begins/ends execution.
 *    An independent blockStack is associated with each function-call. I.e., stacks stored on a stack.
 *    (Non-block commands do not appear on the blockStack.)
 *
 * Limitations:
 *  - Incompatible with flowControl (and derivatives), because they unilaterally override selenium.reset().
 *    Known to have this issue:
 *      selenium_ide__flow_control
 *      goto_while_for_ide
 *
 * Acknowledgements:
 *  SelBlocks reuses bits & parts of extensions: flowControl, datadriven, and include.
 *
 * Wishlist:
 *  - show line numbers in the IDE
 *  - validation of JSON & XML input files
 *  - highlight a command that is failed-but-caught in blue
 *
 * Changes since 1.5:
 *  - added try/catch/finally, elseIf, and exitTest commands
 *  - block boundaries enforced (jumping in-to and/or out-of the middle of blocks)
 *  - script/endScript is replaced by function/endFunction
 *  - implicit initialization of for loop variable(s)
 *  - improved validation of command expressions
 *
 * NOTE - The only thing special about SelBlocks parameters is that they are activated and deactivated
 *   as script execution flows into and out of blocks, (for/endFor, function/endFunction, etc).
 *   They are implemented as regular Selenium variables, and therefore the progress of an executing
 *   script can be monitored using the Stored Variables Viewer addon.
 */


// =============== global functions as script helpers ===============
// getEval script helpers

// Find an element via locator independent of any selenium commands
// (findElementOrNull returns the first if there are multiple matches)
function $e(locator) {
  return selblocks.unwrapObject(selenium.browserbot.findElementOrNull(locator));
}

// Return the singular XPath result as a value of the appropriate type
function $x(xpath, contextNode, resultType) {
  var doc = selenium.browserbot.getDocument();
  var node;
  if (resultType) {
    node = selblocks.xp.selectNode(doc, xpath, contextNode, resultType); // mozilla engine only
  }
  else {
    node = selblocks.xp.selectElement(doc, xpath, contextNode);
  }
  return node;
}

// Return the XPath result set as an array of elements
function $X(xpath, contextNode, resultType) {
  var doc = selenium.browserbot.getDocument();
  var nodes;
  if (resultType) {
    nodes = selblocks.xp.selectNodes(doc, xpath, contextNode, resultType); // mozilla engine only
  }
  else {
    nodes = selblocks.xp.selectElements(doc, xpath, contextNode);
  }
  return nodes;
}

// selbocks name-space
(function($$){

  // =============== Javascript extensions as script helpers ===============
  // EXTENSION REVIEWERS:
  // Global functions are intentional features provided for use by end user's in their Selenium scripts.

  // eg: "dilbert".isOneOf("dilbert","dogbert","mordac") => true
  String.prototype.isOneOf = function(valuesObj)
  {
    var values = valuesObj;
    if (!(values instanceof Array)) {
      // copy function arguments into an array
      values = Array.prototype.slice.call(arguments);
    }
    var i;
    for (i = 0; i < this.length; i++) {
      if (values[i] == this) {
        return true;
      }
    }
    return false;
  };

  // eg: "red".mapTo("primary", ["red","green","blue"]) => primary
  String.prototype.mapTo = function(/* pairs of: string, array */)
  {
    var errMsg = " The map function requires pairs of argument: string, array";
    assert(arguments.length % 2 === 0, errMsg + "; found " + arguments.length);
    var i;
    for (i = 0; i < arguments.length; i += 2) {
      assert((typeof arguments[i].toLowerCase() === "string") && (arguments[i+1] instanceof Array),
        errMsg + "; found " + typeof arguments[i] + ", " + typeof arguments[i+1]);
      if (this.isOneOf(arguments[i+1])) {
        return arguments[i];
      }
    }
    return this;
  };

  // Return a translated version of a string
  // given string args, translate each occurrence of characters in t1 with the corresponding character from t2
  // given array args, if the string occurs in t1, return the corresponding string from t2, else null
  String.prototype.translate = function(t1, t2)
  {
    assert(t1.constructor === t2.constructor, "translate() function requires arrays of the same type");
    assert(t1.length === t2.length, "translate() function requires arrays of equal size");
    var i;
    if (t1.constructor === String) {
      var buf = "";
      for (i = 0; i < this.length; i++) {
        var c = this.substr(i,1);
        var t;
        for (t = 0; t < t1.length; t++) {
          if (c === t1.substr(t,1)) {
            c = t2.substr(t,1);
            break;
          }
        }
        buf += c;
      }
      return buf;
    }

    if (t1.constructor === Array) {
      for (i = 0; i < t1.length; i++) {
        if (t1[i] == this) {
          return t2[i];
        }
      }
    }
    else {
      assert(false, "translate() function requires arguments of type String or Array");
    }
    return null;
  };


  //=============== Call/Scope Stack handling ===============

  var symbols = {};      // command indexes stored by name: function names
  var blockDefs = null;  // static command definitions stored by command index
  var callStack = null;  // command execution stack

  // the idx of the currently executing command
  function idxHere() {
    return testCase.debugContext.debugIndex;
  }

  // Command structure definitions, stored by command index
  function BlockDefs() {
    var blkDefs = [];
    // initialize blockDef at the given command index
    blkDefs.init = function(i, attrs) {
      blkDefs[i] = attrs || {};
      blkDefs[i].idx = i;
      blkDefs[i].cmdName = testCase.commands[i].command;
      return blkDefs[i];
    };
    return blkDefs;
  }

  // retrieve the blockDef at the given command idx
  function blkDefAt(idx) {
    return blockDefs[idx];
  }
  // retrieve the blockDef for the currently executing command
  function blkDefHere() {
    return blkDefAt(idxHere());
  }
  // retrieve the blockDef for the given blockDef frame
  function blkDefFor(stackFrame) {
    if (!stackFrame) {
      return null;
    }
    return blkDefAt(stackFrame.idx);
  }

  // An Array object with stack functionality
  function Stack() {
    var stack = [];
    stack.isEmpty = function() { return stack.length === 0; };
    stack.top = function()     { return stack[stack.length-1]; };
    stack.findEnclosing = function(_hasCriteria) { return stack[stack.indexWhere(_hasCriteria)]; };
    stack.indexWhere = function(_hasCriteria) { // undefined if not found
      var i;
      for (i = stack.length-1; i >= 0; i--) {
        if (_hasCriteria(stack[i])) {
          return i;
        }
      }
    };
    stack.unwindTo = function(_hasCriteria) {
      if (stack.length === 0) {
        return null;
      }
      while (!_hasCriteria(stack.top())) {
        stack.pop();
      }
      return stack.top();
    };
    stack.isHere = function() {
      return (stack.length > 0 && stack.top().idx === idxHere());
    };
    return stack;
  }

  // Determine if the given stack frame is one of the given block kinds
  Stack.isTryBlock = function(stackFrame) { return (blkDefFor(stackFrame).nature === "try"); };
  Stack.isLoopBlock = function(stackFrame) { return (blkDefFor(stackFrame).nature === "loop"); };
  Stack.isFunctionBlock = function(stackFrame) { return (blkDefFor(stackFrame).nature === "function"); };


  // Flow control - we don't just alter debugIndex on the fly, because the command
  // preceding the destination would falsely get marked as successfully executed
  var branchIdx = null;
  // if testCase.nextCommand() ever changes, this will need to be revisited
  // (current as of: selenium-ide-2.8.0)
  function nextCommand() {
    if (!this.started) {
      this.started = true;
      this.debugIndex = testCase.startPoint ? testCase.commands.indexOf(testCase.startPoint) : 0;
    }
    else {
      if (branchIdx !== null) {
        $$.LOG.info("branch => " + fmtCmdRef(branchIdx));
        this.debugIndex = branchIdx;
        branchIdx = null;
      }
      else {
        this.debugIndex++;
      }
    }

    // skip over comments, if any
    while (this.debugIndex < testCase.commands.length)
    {
      if ($$.seleniumEnv == "server") {
        // increment nextCommandRowIndex, which is the IDE equivalent of debugIndex
        // (see pseudo properties in user-extensions-base.js)
        // TBD: find a server equivalent of the IDE commands array
        this._advanceToNextRow();
        if (this.currentRow == null) {
            return null; // no more commands
        }
      }

      var command = testCase.commands[this.debugIndex];
      if (command.type === "command") {
        this.runTimeStamp = Date.now();
        return command;
      }
      this.debugIndex++;
    }
    return null;
  }

  // Set index of the next command to execute via nextCommand().
  function setNextCommand(cmdIdx) {
    assert(cmdIdx >= 0 && cmdIdx < testCase.commands.length,
      " Cannot branch to non-existent command @" + (cmdIdx+1));
    branchIdx = cmdIdx;
  }

  // Selenium calls reset():
  //  * before each single (double-click) command execution
  //  * before a testcase is run
  //  * before each testcase runs in a running testsuite
  // TBD: skip during single command execution
  $$.fn.interceptAfter(Selenium.prototype, "reset", function()
  {
    $$.LOG.trace("In tail intercept :: Selenium.reset()");
    $$.seleniumTestRunner = ($$.seleniumEnv == "server")
      ? htmlTestRunner             // Selenium Server
      : editor.selDebugger.runner; // Selenium IDE

    try {
      compileSelBlocks();
    }
    catch (err) {
      notifyFatalErr("In " + err.fileName + " @" + err.lineNumber + ": " + err);
    }
    callStack = new Stack();
    callStack.push({ blockStack: new Stack() }); // top-level execution state

    $$.tcf = { nestingLevel: -1 }; // try/catch/finally nesting

    // customize flow control logic
    // TBD: this should be a tail intercept rather than brute force replace
    $$.LOG.debug("Configuring tail intercept: testCase.debugContext.nextCommand()");
    $$.fn.interceptReplace(testCase.debugContext, "nextCommand", nextCommand);
  });

  // get the blockStack for the currently active callStack
  function activeBlockStack() {
    return callStack.top().blockStack;
  }

  // ================================================================================
  // Assemble block relationships and symbol locations
  function compileSelBlocks()
  {
    blockDefs = new BlockDefs();
    var lexStack = new Stack();
    var i;
    for (i = 0; i < testCase.commands.length; i++)
    {
      if (testCase.commands[i].type === "command")
      {
        var curCmd = testCase.commands[i].command;
        var aw = curCmd.indexOf("AndWait");
        if (aw !== -1) {
          // just ignore the suffix for now, this may or may not be a SelBlocks command
          curCmd = curCmd.substring(0, aw);
        }
        var cmdTarget = testCase.commands[i].target;

        var ifDef;
        var tryDef;
        var expectedCmd;
        switch(curCmd)
        {
          case "label":
            assertNotAndWaitSuffix(i);
            symbols[cmdTarget] = i;
            break;
          case "goto": case "gotoIf": case "skipNext":
            assertNotAndWaitSuffix(i);
            break;

          case "if":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "if", elseIfIdxs: [] }));
            break;
          case "elseIf":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("elseIf", i, ", is not valid outside of an if/endIf block");
            ifDef = lexStack.top();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            var eIdx = blkDefFor(ifDef).elseIdx;
            if (eIdx) {
              notifyFatal(fmtCmdRef(eIdx) + " An else has to come after all elseIfs.");
            }
            blockDefs.init(i, { ifIdx: ifDef.idx });       // elseIf -> if
            blkDefFor(ifDef).elseIfIdxs.push(i);           // if -> elseIf(s)
            break;
          case "else":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("if", i, ", is not valid outside of an if/endIf block");
            ifDef = lexStack.top();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            if (blkDefFor(ifDef).elseIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one else associated with a given if.");
            }
            blockDefs.init(i, { ifIdx: ifDef.idx });       // else -> if
            blkDefFor(ifDef).elseIdx = i;                  // if -> else
            break;
          case "endIf":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("if", i);
            ifDef = lexStack.pop();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            blockDefs.init(i, { ifIdx: ifDef.idx });       // endIf -> if
            blkDefFor(ifDef).endIdx = i;                   // if -> endif
            if (ifDef.elseIdx) {
              blkDefAt(ifDef.elseIdx).endIdx = i;          // else -> endif
            }
            break;

          case "try":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "try", name: cmdTarget }));
            break;
          case "catch":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("try", i, ", is not valid without a try block");
            tryDef = lexStack.top();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (blkDefFor(tryDef).catchIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one catch-block associated with a given try.");
            }
            var fIdx = blkDefFor(tryDef).finallyIdx;
            if (fIdx) {
              notifyFatal(fmtCmdRef(fIdx) + " A finally-block has to be last in a try section.");
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // catch -> try
            blkDefFor(tryDef).catchIdx = i;                // try -> catch
            break;
          case "finally":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("try", i);
            tryDef = lexStack.top();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (blkDefFor(tryDef).finallyIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one finally-block associated with a given try.");
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // finally -> try
            blkDefFor(tryDef).finallyIdx = i;              // try -> finally
            if (tryDef.catchIdx) {
              blkDefAt(tryDef.catchIdx).finallyIdx = i;    // catch -> finally
            }
            break;
          case "endTry":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("try", i);
            tryDef = lexStack.pop();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (cmdTarget) {
              assertMatching(tryDef.name, cmdTarget, i, tryDef.idx); // pair-up on try-name
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // endTry -> try
            blkDefFor(tryDef).endIdx = i;                  // try -> endTry
            if (tryDef.catchIdx) {
              blkDefAt(tryDef.catchIdx).endIdx = i;        // catch -> endTry
            }
            break;

          case "while":    case "for":    case "foreach":    case "forJson":    case "forXml":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "loop" }));
            break;
          case "continue": case "break":
            assertNotAndWaitSuffix(i);
            assertCmd(i, lexStack.findEnclosing(Stack.isLoopBlock), ", is not valid outside of a loop");
            blockDefs.init(i, { beginIdx: lexStack.top().idx }); // -> begin
            break;
          case "endWhile": case "endFor": case "endForeach": case "endForJson": case "endForXml":
            assertNotAndWaitSuffix(i);
            expectedCmd = curCmd.substr(3).toLowerCase();
            assertBlockIsPending(expectedCmd, i);
            var beginDef = lexStack.pop();
            assertMatching(beginDef.cmdName.toLowerCase(), expectedCmd, i, beginDef.idx);
            blkDefFor(beginDef).endIdx = i;                // begin -> end
            blockDefs.init(i, { beginIdx: beginDef.idx }); // end -> begin
            break;

          case "loadJsonVars": case "loadXmlVars":
            assertNotAndWaitSuffix(i);
            break;

          case "call":
            assertNotAndWaitSuffix(i);
            blockDefs.init(i);
            break;
          case "function":     case "script":
            assertNotAndWaitSuffix(i);
            symbols[cmdTarget] = i;
            lexStack.push(blockDefs.init(i, { nature: "function", name: cmdTarget }));
            break;
          case "return":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending("function", i, ", is not valid outside of a function/endFunction block");
            var funcCmd = lexStack.findEnclosing(Stack.isFunctionBlock);
            blockDefs.init(i, { funcIdx: funcCmd.idx });   // return -> function
            break;
          case "endFunction":  case "endScript":
            assertNotAndWaitSuffix(i);
            expectedCmd = curCmd.substr(3).toLowerCase();
            assertBlockIsPending(expectedCmd, i);
            var funcDef = lexStack.pop();
            assertMatching(funcDef.cmdName.toLowerCase(), expectedCmd, i, funcDef.idx);
            if (cmdTarget) {
              assertMatching(funcDef.name, cmdTarget, i, funcDef.idx); // pair-up on function name
            }
            blkDefFor(funcDef).endIdx = i;                 // function -> endFunction
            blockDefs.init(i, { funcIdx: funcDef.idx });   // endFunction -> function
            break;

          case "exitTest":
            assertNotAndWaitSuffix(i);
            break;
          default:
        }
      }
    }
    if (!lexStack.isEmpty()) {
      // unterminated block(s)
      var cmdErrors = [];
      while (!lexStack.isEmpty()) {
        var pend = lexStack.pop();
        cmdErrors.unshift(fmtCmdRef(pend.idx) + " without a terminating "
          + "'end" + pend.cmdName.substr(0, 1).toUpperCase() + pend.cmdName.substr(1) + "'"
        );
      }
      throw new SyntaxError(cmdErrors.join("; "));
    }
    //- command validation
    function assertNotAndWaitSuffix(cmdIdx) {
      assertCmd(cmdIdx, (testCase.commands[cmdIdx].command.indexOf("AndWait") === -1),
        ", AndWait suffix is not valid for SelBlocks commands");
    }
    //- active block validation
    function assertBlockIsPending(expectedCmd, cmdIdx, desc) {
      assertCmd(cmdIdx, !lexStack.isEmpty(), desc || ", without an beginning [" + expectedCmd + "]");
    }
    //- command-pairing validation
    function assertMatching(curCmd, expectedCmd, cmdIdx, pendIdx) {
      assertCmd(cmdIdx, curCmd === expectedCmd, ", does not match command " + fmtCmdRef(pendIdx));
    }
  }

  // --------------------------------------------------------------------------------

  // prevent jumping in-to and/or out-of loop/function/try blocks
  function assertIntraBlockJumpRestriction(fromIdx, toIdx) {
    var fromRange = findBlockRange(fromIdx);
    var toRange   = findBlockRange(toIdx);
    if (fromRange || toRange) {
      var msg = " Attempt to jump";
      if (fromRange) { msg += " out of " + fromRange.desc + fromRange.fmt(); }
      if (toRange)   { msg += " into " + toRange.desc + toRange.fmt(); }
      assert(fromRange && fromRange.equals(toRange), msg 
        + ". You cannot jump into, or out of: loops, functions, or try blocks.");
    }
  }

  // ascertain in which, if any, block that an locusIdx occurs
  function findBlockRange(locusIdx) {
    var idx;
    for (idx = locusIdx-1; idx >= 0; idx--) {
      var blk = blkDefAt(idx);
      if (blk) {
        if (locusIdx > blk.endIdx) { // ignore blocks that are inside this same block
          continue;
        }
        switch (blk.nature) {
          case "loop":     return new CmdRange(blk.idx, blk.endIdx, blk.cmdName + " loop");
          case "function": return new CmdRange(blk.idx, blk.endIdx, "function '" + blk.name + "'");
          case "try":      return isolateTcfRange(locusIdx, blk);
        }
      }
    }
    // return as undefined (no enclosing block at all)
  }

  // pin-point in which sub-block, (try, catch or finally), that the idx occurs
  function isolateTcfRange(idx, tryDef) {
    // assumptions: idx is known to be between try & endTry, and catch always precedes finally
    var RANGES = [
      { ifr: tryDef.finallyIdx, ito: tryDef.endIdx,     desc: "finally", desc2: "end" }
     ,{ ifr: tryDef.catchIdx,   ito: tryDef.finallyIdx, desc: "catch",   desc2: "finally" }
     ,{ ifr: tryDef.catchIdx,   ito: tryDef.endIdx,     desc: "catch",   desc2: "end" }
     ,{ ifr: tryDef.idx,        ito: tryDef.catchIdx,   desc: "try",     desc2: "catch" }
     ,{ ifr: tryDef.idx,        ito: tryDef.finallyIdx, desc: "try",     desc2: "finally" }
     ,{ ifr: tryDef.idx,        ito: tryDef.endIdx,     desc: "try",     desc2: "end" }
    ];
    var i;
    for (i = 0; i < RANGES.length; i++) {
      var rng = RANGES[i];
      if (rng.ifr <= idx && idx < rng.ito) {
        var desc = rng.desc + "-block";
        if (rng.desc !== "try") { desc += " for"; }
        if (tryDef.name)       { desc += " '" + tryDef.name + "'"; }
        return new CmdRange(rng.ifr, rng.ito, desc);
      }
    }
  }

  // represents a range of script lines
  function CmdRange(topIdx, bottomIdx, desc) {
    this.topIdx = topIdx;
    this.bottomIdx = bottomIdx;
    this.desc = desc;
    this.equals = function(cmdRange) {
      return (cmdRange && cmdRange.topIdx === this.topIdx && cmdRange.bottomIdx === this.bottomIdx);
    };
    this.fmt = function() {
      return " @[" + (this.topIdx+1) + "-" + (this.bottomIdx+1) + "]";
    };
  }

  // ==================== SelBlocks Commands (Custom Selenium Actions) ====================

  var iexpr = Object.create($$.InfixExpressionParser);

  // validate variable/parameter names
  function validateNames(names, desc) {
    var i;
    for (i = 0; i < names.length; i++) {
      validateName(names[i], desc);
    }
  }
  function validateName(name, desc) {
    var match = name.match(/^[a-zA-Z]\w*$/);
    if (!match) {
      notifyFatal("Invalid character(s) in " + desc + " name: '" + name + "'");
    }
  }

  Selenium.prototype.doLabel = function() {
    // noop
  };

  // Skip the next N commands (default is 1)
  Selenium.prototype.doSkipNext = function(spec)
  {
    assertRunning();
    var n = parseInt($$.evalWithVars(spec), 10);
    if (isNaN(n)) {
      if (spec.trim() === "") { n = 1; }
      else { notifyFatalHere(" Requires a numeric value"); }
    }
    else if (n < 0) {
      notifyFatalHere(" Requires a number > 1");
    }

    if (n !== 0) { // if n=0, execute the next command as usual
      destIdx = idxHere() + n + 1;
      assertIntraBlockJumpRestriction(idxHere(), destIdx);
      setNextCommand(destIdx);
    }
  };

  Selenium.prototype.doGoto = function(label)
  {
    assertRunning();
    assert(symbols[label]!==undefined, " Target label '" + label + "' is not found.");
    assertIntraBlockJumpRestriction(idxHere(), symbols[label]);
    setNextCommand(symbols[label]);
  };

  Selenium.prototype.doGotoIf = function(condExpr, label)
  {
    assertRunning();
    if ($$.evalWithVars(condExpr)) {
      this.doGoto(label);
    }
  };

  // ================================================================================
  Selenium.prototype.doIf = function(condExpr, locator)
  {
    assertRunning();
    var ifDef = blkDefHere();
    var ifState = { idx: idxHere(), elseIfItr: arrayIterator(ifDef.elseIfIdxs) };
    activeBlockStack().push(ifState);
    cascadeElseIf(ifState, condExpr);
  };
  Selenium.prototype.doElseIf = function(condExpr)
  {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    var ifState = activeBlockStack().top();
    if (ifState.skipElseBlocks) { // if, or previous elseIf, has already been met
      setNextCommand(blkDefAt(blkDefHere().ifIdx).endIdx);
    }
    else {
      cascadeElseIf(ifState, condExpr);
    }
  };
  Selenium.prototype.doElse = function()
  {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    var ifState = activeBlockStack().top();
    if (ifState.skipElseBlocks) { // if, or previous elseIf, has already been met
      setNextCommand(blkDefHere().endIdx);
    }
    // else continue into else-block
  };
  Selenium.prototype.doEndIf = function() {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    activeBlockStack().pop();
    // fall out of if-endIf
  };

  function cascadeElseIf(ifState, condExpr) {
    assertCompilable("", condExpr, ";", "Invalid condition");
    if (!$$.evalWithVars(condExpr)) {
      // jump to next elseIf or else or endif
      var ifDef = blkDefFor(ifState);
      if (ifState.elseIfItr.hasNext()) { setNextCommand(ifState.elseIfItr.next()); }
      else if (ifDef.elseIdx)          { setNextCommand(ifDef.elseIdx); }
      else                             { setNextCommand(ifDef.endIdx); }
    }
    else {
      ifState.skipElseBlocks = true;
      // continue into if/elseIf block
    }
  }

  // ================================================================================

  // throw the given Error
  Selenium.prototype.doThrow = function(err) {
    err = $$.evalWithVars(err);
    if (!(err instanceof Error)) {
      err = new SelblocksError(idxHere(), err);
    }
    throw err;
  };

  // TBD: failed locators/timeouts/asserts ?
  Selenium.prototype.doTry = function(tryName)
  {
    assertRunning();
    var tryState = { idx: idxHere(), name: tryName };
    activeBlockStack().push(tryState);
    var tryDef = blkDefHere();

    if (!tryDef.catchIdx && !tryDef.finallyIdx) {
      $$.LOG.warn(fmtCurCmd() + " does not have a catch-block nor a finally-block, and therefore serves no purpose");
      if ($$.tcf.nestingLevel === -1) {
        return; // continue into try-block without any special error handling
      }
    }

    // log an advisory about the active catch block
    if (tryDef.catchIdx) {
      var errDcl = testCase.commands[tryDef.catchIdx].target;
      $$.LOG.debug(tryName + " catchable: " + (errDcl || "ANY"));
    }

    $$.tcf.nestingLevel++;
    tryState.execPhase = "trying";

    if ($$.tcf.nestingLevel === 0) {
      // enable special command handling
      $$.fn.interceptPush($$.seleniumTestRunner.currentTest, "resume",
        $$.handleAsTryBlock, { manageError: handleCommandError });
    }
    $$.LOG.debug("++ try nesting: " + $$.tcf.nestingLevel);
    // continue into try-block
  };

  Selenium.prototype.doCatch = function()
  {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    var tryState = activeBlockStack().top();
    if (tryState.execPhase !== "catching") {
      // skip over unused catch-block
      var tryDef = blkDefFor(tryState);
      if (tryDef.finallyIdx) {
        setNextCommand(tryDef.finallyIdx);
      }
      else {
        setNextCommand(tryDef.endIdx);
      }
    }
    $$.LOG.debug("entering catch block");
    // else continue into catch-block
  };
  Selenium.prototype.doFinally = function() {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    delete storedVars._error;
    $$.LOG.debug("entering finally block");
    // continue into finally-block
  };
  Selenium.prototype.doEndTry = function(tryName)
  {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    delete storedVars._error;
    var tryState = activeBlockStack().pop();
    if (tryState.execPhase) { // ie, it DOES have a catch and/or a finally block
      $$.tcf.nestingLevel--;
      $$.LOG.debug("-- try nesting: " + $$.tcf.nestingLevel);
      if ($$.tcf.nestingLevel < 0) {
        // discontinue try-block handling
        $$.fn.interceptPop();
        // $$.tcf.bubbling = null;
      }
      if ($$.tcf.bubbling) {
        reBubble();
      }
      else {
        $$.LOG.debug("no bubbling in process");
      }
    }
    var tryDef = blkDefFor(tryState);
    $$.LOG.debug("end of try '" + tryDef.name + "'");
    // fall out of endTry
  };

  // --------------------------------------------------------------------------------

  // alter the behavior of Selenium error handling
  //   returns true if catch/finally bubbling is active
  function handleCommandError(err)
  {
    var tryState = bubbleToTryBlock(Stack.isTryBlock);
    var tryDef = blkDefFor(tryState);
    if (tryState) {
      $$.LOG.debug("error encountered while: " + tryState.execPhase);
      if (hasUnspentCatch(tryState)) {
        if (isMatchingCatch(err, tryDef.catchIdx)) {
          // an expected kind of error has been caught
          $$.LOG.info("@" + (idxHere()+1) + ", error has been caught" + fmtCatching(tryState));
          tryState.hasCaught = true;
          tryState.execPhase = "catching";
          storedVars._error = err;
          $$.tcf.bubbling = null;
          setNextCommand(tryDef.catchIdx);
          return true;
        }
      }
    }
    // error not caught .. instigate bubbling
    $$.LOG.debug("error not caught, bubbling error: '" + err.message + "'");
    $$.tcf.bubbling = { mode: "error", error: err, srcIdx: idxHere() };
    if (hasUnspentFinally(tryState)) {
      $$.LOG.info("Bubbling suspended while finally block runs");
      tryState.execPhase = "finallying";
      tryState.hasFinaled = true;
      setNextCommand(tryDef.finallyIdx);
      return true;
    }
    if ($$.tcf.nestingLevel > 0) {
      $$.LOG.info("No further handling, error bubbling will continue outside of this try.");
      setNextCommand(tryDef.endIdx);
      return true;
    }
    $$.LOG.info("No handling provided in this try section for this error: '" + err.message + "'");
    return false; // stop test
  }

  // execute any enclosing finally block(s) until reaching the given type of enclosing block
  function bubbleCommand(cmdIdx, _isContextBlockType)
  {
    var tryState = bubbleToTryBlock(isTryWithMatchingOrFinally);
    var tryDef = blkDefFor(tryState);
    $$.tcf.bubbling = { mode: "command", srcIdx: cmdIdx, _isStopCriteria: _isContextBlockType };
    if (hasUnspentFinally(tryState)) {
      $$.LOG.info("Command " + fmtCmdRef(cmdIdx) + ", suspended while finally block runs");
      tryState.execPhase = "finallying";
      tryState.hasFinaled = true;
      setNextCommand(tryDef.finallyIdx);
      // begin finally block
    }
    else {
      $$.LOG.info("No further handling, bubbling continuing outside of this try.");
      setNextCommand(tryDef.endIdx);
      // jump out of try section
    }

    //- determine if catch matches an error, or there is a finally, or the ceiling block has been reached
    function isTryWithMatchingOrFinally(stackFrame) {
      if (_isContextBlockType && _isContextBlockType(stackFrame)) {
        return true;
      }
      if ($$.tcf.bubbling && $$.tcf.bubbling.mode === "error" && hasUnspentCatch(stackFrame)) {
        var tryDef = blkDefFor(stackFrame);
        if (isMatchingCatch($$.tcf.bubbling.error, tryDef.catchIdx)) {
          return true;
        }
      }
      return hasUnspentFinally(stackFrame);
    }
  }

  //- error message matcher
  function isMatchingCatch(e, catchIdx) {
    var errDcl = testCase.commands[catchIdx].target;
    if (!errDcl) {
      return true; // no error specified means catch all errors
    }
    var errExpr = $$.evalWithVars(errDcl);
    var errMsg = e.message;
    if (errExpr instanceof RegExp) {
      return (errMsg.match(errExpr));
    }
    return (errMsg.indexOf(errExpr) !== -1);
  }

  // unwind the blockStack, and callStack (ie, aborting functions), until reaching the given criteria
  function bubbleToTryBlock(_hasCriteria) {
    if ($$.tcf.nestingLevel < 0) {
      $$.LOG.warn("bubbleToTryBlock() called outside of any try nesting");
    }
    var tryState = unwindToBlock(_hasCriteria);
    while (!tryState && $$.tcf.nestingLevel > -1 && callStack.length > 1) {
      var callFrame = callStack.pop();
      $$.LOG.info("function '" + callFrame.name + "' aborting due to error");
      restoreVarState(callFrame.savedVars);
      tryState = unwindToBlock(_hasCriteria);
    }
    return tryState;
  }

  // unwind the blockStack until reaching the given criteria
  function unwindToBlock(_hasCriteria) {
    var tryState = activeBlockStack().unwindTo(_hasCriteria);
    if (tryState) {
      $$.LOG.debug("unwound to: " + fmtTry(tryState));
    }
    return tryState;
  }

  // resume or conclude command/error bubbling
  function reBubble() {
    if ($$.tcf.bubbling.mode === "error") {
      if ($$.tcf.nestingLevel > -1) {
        $$.LOG.debug("error-bubbling continuing...");
        handleCommandError($$.tcf.bubbling.error);
      }
      else {
        $$.LOG.error("Error was not caught: '" + $$.tcf.bubbling.error.message + "'");
        try { throw $$.tcf.bubbling.error; }
        finally { $$.tcf.bubbling = null; }
      }
    }
    else { // mode == "command"
      if (isBubblable()) {
        $$.LOG.debug("command-bubbling continuing...");
        bubbleCommand($$.tcf.bubbling.srcIdx, $$.tcf.bubbling._isStopCriteria);
      }
      else {
        $$.LOG.info("command-bubbling complete - suspended command executing now " + fmtCmdRef($$.tcf.bubbling.srcIdx));
        setNextCommand($$.tcf.bubbling.srcIdx);
        $$.tcf.bubbling = null;
      }
    }
  }

  // instigate or transform bubbling, as appropriate
  function transitionBubbling(_isContextBlockType)
  {
    if ($$.tcf.bubbling) { // transform bubbling
      if ($$.tcf.bubbling.mode === "error") {
        $$.LOG.debug("Bubbling error: '" + $$.tcf.bubbling.error.message + "'"
          + ", replaced with command " + fmtCmdRef(idxHere()));
        $$.tcf.bubbling = { mode: "command", srcIdx: idxHere(), _isStopCriteria: _isContextBlockType };
        return true;
      }
      // mode == "command"
      $$.LOG.debug("Command suspension " + fmtCmdRef($$.tcf.bubbling.srcIdx)
        + ", replaced with " + fmtCmdRef(idxHere()));
      $$.tcf.bubbling.srcIdx = idxHere();
      return true;
    }
    if (isBubblable(_isContextBlockType)) { // instigate bubbling
      bubbleCommand(idxHere(), _isContextBlockType);
      return true;
    }
    // no change to bubbling
    return false;
  }

  // determine if bubbling is possible from this point outward
  function isBubblable(_isContextBlockType) {
    var canBubble = ($$.tcf.nestingLevel > -1);
    if (canBubble) {
      var blkState = activeBlockStack().findEnclosing(isTryOrContextBlockType);
      return (blkDefFor(blkState).nature === "try");
    }
    return canBubble;

    //- determine if stackFrame is a try-block or the given type of block
    function isTryOrContextBlockType(stackFrame) {
      if (_isContextBlockType && _isContextBlockType(stackFrame)) {
        return true;
      }
      return Stack.isTryBlock(stackFrame);
    }
  }

  function hasUnspentCatch(tryState) {
    return (tryState && blkDefFor(tryState).catchIdx && !tryState.hasCaught);
  }
  function hasUnspentFinally(tryState) {
    return (tryState && blkDefFor(tryState).finallyIdx && !tryState.hasFinaled);
  }

  function fmtTry(tryState)
  {
    var tryDef = blkDefFor(tryState);
    return (
      (tryDef.name ? "try '" + tryDef.name + "' " : "")
      + "@" + (tryState.idx+1)
      + ", " + tryState.execPhase + ".."
      + " " + $$.tcf.nestingLevel + "n"
    );
  }

  function fmtCatching(tryState)
  {
    if (!tryState) {
      return "";
    }
    var bbl = "";
    if ($$.tcf.bubbling) {
      bbl = "@" + ($$.tcf.bubbling.srcIdx+1) + " ";
    }
    var tryDef = blkDefFor(tryState);
    var catchDcl = testCase.commands[tryDef.catchIdx].target;
    return " :: " + bbl + catchDcl;
  }

  // ================================================================================
  Selenium.prototype.doWhile = function(condExpr)
  {
    enterLoop(
      function() {    // validate
          assert(condExpr, " 'while' requires a condition expression.");
          assertCompilable("", condExpr, ";", "Invalid condition");
          return null;
      }
      ,function() { } // initialize
      ,function() { return ($$.evalWithVars(condExpr)); } // continue?
      ,function() { } // iterate
    );
  };
  Selenium.prototype.doEndWhile = function() {
    iterateLoop();
  };

  // ================================================================================
  Selenium.prototype.doFor = function(forSpec)
  {
    enterLoop(
      function(loop) { // validate
          assert(forSpec, " 'for' requires: <initial-val>; <condition>; <iter-stmt>.");
          assertCompilable("for ( ", forSpec, " );", "Invalid loop parameters");
          var specs = iexpr.splitList(forSpec, ";");
          assert(specs.length === 3, " 'for' requires <init-stmt>; <condition>; <iter-stmt>.");
          loop.initStmt = specs[0];
          loop.condExpr = specs[1];
          loop.iterStmt = specs[2];
          var localVarNames = parseVarNames(loop.initStmt);
          $$.LOG.debug("localVarNames: " + localVarNames.join(','));
          validateNames(localVarNames, "variable");
          return localVarNames;
      }
      ,function(loop) { $$.evalWithVars(loop.initStmt); }          // initialize
      ,function(loop) { return ($$.evalWithVars(loop.condExpr)); } // continue?
      ,function(loop) { $$.evalWithVars(loop.iterStmt); }          // iterate
    );
  };
  Selenium.prototype.doEndFor = function() {
    iterateLoop();
  };

  function parseVarNames(initStmt) {
    var varNames = [];
    if (initStmt) {
      var vInits = iexpr.splitList(initStmt, ",");
      var i;
      for (i = 0; i < vInits.length; i++) {
        var vInit = iexpr.splitList(vInits[i], "=");
        varNames.push(vInit[0]);
      }
    }
    return varNames;
  }

  // ================================================================================
  Selenium.prototype.doForeach = function(varName, valueExpr)
  {
    enterLoop(
      function(loop) { // validate
          assert(varName, " 'foreach' requires a variable name.");
          assert(valueExpr, " 'foreach' requires comma-separated values.");
          assertCompilable("[ ", valueExpr, " ];", "Invalid value list");
          loop.values = $$.evalWithVars("[" + valueExpr + "]");
          if (loop.values.length === 1 && loop.values[0] instanceof Array) {
            loop.values = loop.values[0]; // if sole element is an array, than use it
          }
          return [varName, "_i"];
      }
      ,function(loop) { loop.i = 0; storedVars[varName] = loop.values[loop.i]; }       // initialize
      ,function(loop) { storedVars._i = loop.i; return (loop.i < loop.values.length);} // continue?
      ,function(loop) { // iterate
          if (++(loop.i) < loop.values.length) {
            storedVars[varName] = loop.values[loop.i];
          }
      }
    );
  };
  Selenium.prototype.doEndForeach = function() {
    iterateLoop();
  };

  // ================================================================================
  Selenium.prototype.doLoadJsonVars = function(filepath, selector)
  {
    assert(filepath, " Requires a JSON file path or URL.");
    var jsonReader = new $$.fn.JSONReader(filepath);
    loadVars(jsonReader, "JSON object", filepath, selector);
  };
  Selenium.prototype.doLoadXmlVars = function(filepath, selector)
  {
    assert(filepath, " Requires an XML file path or URL.");
    var xmlReader = new $$.fn.XmlReader(filepath);
    loadVars(xmlReader, "XML element", filepath, selector);
  };
  Selenium.prototype.doLoadVars = function(filepath, selector)
  {
    $$.LOG.warn("The loadVars command has been deprecated as of SelBlocks 2.0.2 and will be removed in future releases."
      + " Please use loadXmlVars instead.");
    Selenium.prototype.doLoadXmlVars(filepath, selector);
  };

  function loadVars(reader, desc, filepath, selector)
  {
    if (selector) {
      assertCompilable("", selector, ";", "Invalid selector condition");
    }
    reader.load(filepath);
    reader.next(); // read first varset and set values on storedVars
    if (!selector && !reader.EOF()) {
      notifyFatalHere(" Multiple " + desc + "s are not valid for this command."
        + ' (A specific ' + desc + ' can be selected by specifying: name="value".)');
    }

    var result = $$.evalWithVars(selector);
    if (typeof result !== "boolean") {
      notifyFatalHere(", " + selector + " is not a boolean expression");
    }

    // read until specified set found
    var isEof = reader.EOF();
    while (!isEof && $$.evalWithVars(selector) !== true) {
      reader.next(); // read next varset and set values on storedVars
      isEof = reader.EOF();
    } 

    if (!$$.evalWithVars(selector)) {
      notifyFatalHere(desc + " not found for selector expression: " + selector
        + "; in input file " + filepath);
    }
  }


  // ================================================================================
  Selenium.prototype.doForJson = function(jsonpath)
  {
    enterLoop(
      function(loop) {  // validate
          assert(jsonpath, " Requires a JSON file path or URL.");
          loop.jsonReader = new $$.fn.JSONReader();
          var localVarNames = loop.jsonReader.load(jsonpath);
          return localVarNames;
      }
      ,function() { }   // initialize
      ,function(loop) { // continue?
          var isEof = loop.jsonReader.EOF();
          if (!isEof) { loop.jsonReader.next(); }
          return !isEof;
      }
      ,function() { }
    );
  };
  Selenium.prototype.doEndForJson = function() {
    iterateLoop();
  };

  Selenium.prototype.doForXml = function(xmlpath)
  {
    enterLoop(
      function(loop) {  // validate
          assert(xmlpath, " 'forXml' requires an XML file path or URL.");
          loop.xmlReader = new $$.fn.XmlReader();
          var localVarNames = loop.xmlReader.load(xmlpath);
          return localVarNames;
      }
      ,function() { }   // initialize
      ,function(loop) { // continue?
          var isEof = loop.xmlReader.EOF();
          if (!isEof) { loop.xmlReader.next(); }
          return !isEof;
      }
      ,function() { }
    );
  };
  Selenium.prototype.doEndForXml = function() {
    iterateLoop();
  };



  // --------------------------------------------------------------------------------
  // Note: Selenium variable expansion occurs before command processing, therefore we re-execute
  // commands that *may* contain ${} variables. Bottom line, we can't just keep a copy
  // of parameters and then iterate back to the first command inside the body of a loop.

  function enterLoop(_validateFunc, _initFunc, _condFunc, _iterFunc)
  {
    assertRunning();
    var loopState;
    if (!activeBlockStack().isHere()) {
      // loop begins
      loopState = { idx: idxHere() };
      activeBlockStack().push(loopState);
      var localVars = _validateFunc(loopState);
      loopState.savedVars = getVarState(localVars);
      initVarState(localVars); // because with-scope can reference storedVars only once they exist
      _initFunc(loopState);
    }
    else {
      // iteration
      loopState = activeBlockStack().top();
      _iterFunc(loopState);
    }

    if (!_condFunc(loopState)) {
      loopState.isComplete = true;
      // jump to bottom of loop for exit
      setNextCommand(blkDefHere().endIdx);
    }
    // else continue into body of loop
  }
  function iterateLoop()
  {
    assertRunning();
    assertActiveScope(blkDefHere().beginIdx);
    var loopState = activeBlockStack().top();
    if (loopState.isComplete) {
      restoreVarState(loopState.savedVars);
      activeBlockStack().pop();
      // done, fall out of loop
    }
    else {
      // jump back to top of loop
      setNextCommand(blkDefHere().beginIdx);
    }
  }

  // ================================================================================
  Selenium.prototype.doContinue = function(condExpr) {
    var loopState = dropToLoop(condExpr);
    if (loopState) {
      // jump back to top of loop for next iteration, if any
      var endCmd = blkDefFor(loopState);
      setNextCommand(blkDefAt(endCmd.endIdx).beginIdx);
    }
  };
  Selenium.prototype.doBreak = function(condExpr) {
    var loopState = dropToLoop(condExpr);
    if (loopState) {
      loopState.isComplete = true;
      // jump to bottom of loop for exit
      setNextCommand(blkDefFor(loopState).endIdx);
    }
  };

  // Unwind the command stack to the inner-most active loop block
  // (unless the optional condition evaluates to false)
  function dropToLoop(condExpr)
  {
    assertRunning();
    if (condExpr) {
      assertCompilable("", condExpr, ";", "Invalid condition");
    }
    if (transitionBubbling(Stack.isLoopBlock)) {
      return;
    }
    if (condExpr && !$$.evalWithVars(condExpr)) {
      return;
    }
    var loopState = activeBlockStack().unwindTo(Stack.isLoopBlock);
    return loopState;
  }


  // ================================================================================
  Selenium.prototype.doCall = function(funcName, argSpec)
  {
    assertRunning(); // TBD: can we do single execution, ie, run from this point then break on return?
    if (argSpec) {
      assertCompilable("var ", argSpec, ";", "Invalid call parameter(s)");
    }
    var funcIdx = symbols[funcName];
    assert(funcIdx!==undefined, " Function does not exist: " + funcName + ".");

    var activeCallFrame = callStack.top();
    if (activeCallFrame.isReturning && activeCallFrame.returnIdx === idxHere()) {
      // returning from completed function
      restoreVarState(callStack.pop().savedVars);
    }
    else {
      // save existing variable state and set args as local variables
      var args = parseArgs(argSpec);
      var savedVars = getVarStateFor(args);
      setVars(args);

      callStack.push({ funcIdx: funcIdx, name: funcName, args: args, returnIdx: idxHere(),
        savedVars: savedVars, blockStack: new Stack() });
      // jump to function body
      setNextCommand(funcIdx);
    }
  };
  Selenium.prototype.doFunction = function(funcName)
  {
    assertRunning();

    var funcDef = blkDefHere();
    var activeCallFrame = callStack.top();
    if (activeCallFrame.funcIdx === idxHere()) {
      // get parameter values
      setVars(activeCallFrame.args);
    }
    else {
      // no active call, skip around function body
      setNextCommand(funcDef.endIdx);
    }
  };
  Selenium.prototype.doScript = function(scrName)
  {
    $$.LOG.warn("The script command has been deprecated as of SelBlocks 2.0 and will be removed in future releases."
      + " Please use function instead.");
    Selenium.prototype.doFunction(scrName);
  };
  Selenium.prototype.doReturn = function(value) {
    returnFromFunction(null, value);
  };
  Selenium.prototype.doEndFunction = function(funcName) {
    returnFromFunction(funcName);
  };
  Selenium.prototype.doEndScript = function(scrName) {
    returnFromFunction(scrName);
  };

  function returnFromFunction(funcName, returnVal)
  {
    assertRunning();
    if (transitionBubbling(Stack.isFunctionBlock)) {
      return;
    }
    var endDef = blkDefHere();
    var activeCallFrame = callStack.top();
    if (activeCallFrame.funcIdx !== endDef.funcIdx) {
      // no active call, we're just skipping around a function block
    }
    else {
      if (returnVal) { storedVars._result = $$.evalWithVars(returnVal); }
      activeCallFrame.isReturning = true;
      // jump back to call command
      setNextCommand(activeCallFrame.returnIdx);
    }
  }


  // ================================================================================
  Selenium.prototype.doExitTest = function() {
    if (transitionBubbling()) {
      return;
    }
    // intercept command processing and simply stop test execution instead of executing the next command
    $$.fn.interceptOnce($$.seleniumTestRunner.currentTest, "resume", $$.handleAsExitTest);
  };


  // ========= storedVars management =========

  function parseArgs(argSpec) { // comma-sep -> new prop-set
    var args = {};
    var parms = iexpr.splitList(argSpec, ",");
    var i;
    for (i = 0; i < parms.length; i++) {
      var keyValue = iexpr.splitList(parms[i], "=");
      validateName(keyValue[0], "parameter");
      args[keyValue[0]] = $$.evalWithVars(keyValue[1]);
    }
    return args;
  }
  function initVarState(names) { // new -> storedVars(names)
    if (names) {
      var i;
      for (i = 0; i < names.length; i++) {
        if (!storedVars[names[i]]) {
          storedVars[names[i]] = null;
        }
      }
    }
  }
  function getVarStateFor(args) { // storedVars(prop-set) -> new prop-set
    var savedVars = {};
    var varname;
    for (varname in args) {
      savedVars[varname] = storedVars[varname];
    }
    return savedVars;
  }
  function getVarState(names) { // storedVars(names) -> new prop-set
    var savedVars = {};
    if (names) {
      var i;
      for (i = 0; i < names.length; i++) {
        savedVars[names[i]] = storedVars[names[i]];
      }
    }
    return savedVars;
  }
  function setVars(args) { // prop-set -> storedVars
    var varname;
    for (varname in args) {
      storedVars[varname] = args[varname];
    }
  }
  function restoreVarState(savedVars) { // prop-set --> storedVars
    var varname;
    for (varname in savedVars) {
      if (savedVars[varname] === undefined) {
        delete storedVars[varname];
      }
      else {
        storedVars[varname] = savedVars[varname];
      }
    }
  }

  // ========= error handling =========

  function SelblocksError(idx, message) {
    this.name = "SelblocksError";
    this.message = (message || "");
    this.idx = idx;
  }
  SelblocksError.prototype = Error.prototype;

  // TBD: make into throwable Errors
  function notifyFatalErr(msg, err) {
    $$.LOG.error("Error " + msg);
    $$.LOG.logStackTrace(err);
    throw err;
  }
  function notifyFatal(msg) {
    var err = new Error(msg);
    $$.LOG.error("Error " + msg);
    $$.LOG.logStackTrace(err);
    throw err;
  }
  function notifyFatalCmdRef(idx, msg) { notifyFatal(fmtCmdRef(idx) + msg); }
  function notifyFatalHere(msg) { notifyFatal(fmtCurCmd() + msg); }

  function assertCmd(idx, cond, msg) { if (!cond) { notifyFatalCmdRef(idx, msg); } }
  function assert(cond, msg)         { if (!cond) { notifyFatalHere(msg); } }
  // TBD: can we at least show result of expressions?
  function assertRunning() {
    assert(testCase.debugContext.started, " Command is only valid in a running script,"
        + " i.e., cannot be executed via double-click, or via 'Execute this command'.");
  }
  function assertActiveScope(expectedIdx) {
    var activeIdx = activeBlockStack().top().idx;
    assert(activeIdx === expectedIdx, " unexpected command, active command was " + fmtCmdRef(activeIdx));
  }

  function assertCompilable(left, stmt, right, explanation) {
    try {
      $$.evalWithVars("function selblocksTemp() { " + left + stmt + right + " }");
    }
    catch (e) {
      throw new SyntaxError(fmtCmdRef(idxHere()) + " " + explanation + " '" + stmt +  "': " + e.message);
    }
  }

  function fmtCurCmd() {
    return fmtCmdRef(idxHere());
  }
  function fmtCmdRef(idx) {
    return ("@" + (idx+1) + ": [" + $$.fmtCmd(testCase.commands[idx]) + "]");
  }

  //================= utils ===============

  $$.evalWithVars = function(expr) {
    var result = null;
    try {
      // EXTENSION REVIEWERS: Use of eval is consistent with the Selenium extension itself.
      // Scripted expressions run in the Selenium window, isolated from any web content.
      result = eval("with (storedVars) {" + expr + "}");
    }
    catch (e) {
      notifyFatalErr(" While evaluating Javascript expression: " + expr, e);
    }
    return result;
  }

  // Elapsed time, optional duration provides expiration
  function IntervalTimer(msDuration) {
    this.msStart = +new Date();
    this.getElapsed = function() { return (+new Date() - this.msStart); };
    this.hasExpired = function() { return (msDuration && this.getElapsed() > msDuration); };
    this.reset = function() { this.msStart = +new Date(); };
  }

  // produce an iterator object for the given array
  function arrayIterator(arrayObject) {
    return new function(ary) {
      var cur = 0;
      this.hasNext = function() { return (cur < ary.length); };
      this.next = function() { if (this.hasNext()) { return ary[cur++]; } };
    }(arrayObject);
  };

}(selblocks));

// ================================================================================
// from: data-reader.js

// SelBlocks name-space
(function($$){

  // Adapted from the datadriven plugin
  // http://web.archive.org/web/20120928080130/http://wiki.openqa.org/display/SEL/datadriven

  // ==================== XmlReader ====================

  $$.fn.XmlReader = function()
  {
    var varsets = null;
    var varNames = null;
    var curVars = null;
    var varsetIdx = 0;

    // load XML file and return the list of var names found in the first <VARS> element
    this.load = function(filepath)
    {
      var xmlHttpReq = doAjaxRequest(filepath, "text/xml");
      var fileObj = xmlHttpReq.responseXML; // XML DOM
      varsets = fileObj.getElementsByTagName("vars"); // HTMLCollection
      if (varsets === null || varsets.length === 0) {
        throw new Error("A <vars> element could not be loaded, or <testdata> was empty.");
      }

      curVars = 0;
      varNames = attrNamesFor(varsets[0]);
      return varNames;
    };

    this.EOF = function() {
      return (curVars === null || curVars >= varsets.length);
    };

    this.next = function()
    {
      if (this.EOF()) {
        $$.LOG.error("No more <vars> elements to read after element #" + varsetIdx);
        return;
      }
      varsetIdx++;
      $$.LOG.debug(varsetIdx + ") " + serializeXml(varsets[curVars]));  // log each name & value

      var expected = countAttrs(varsets[0]);
      var found = countAttrs(varsets[curVars]);
      if (found !== expected) {
        throw new Error("Inconsistent <testdata> at <vars> element #" + varsetIdx
          + "; expected " + expected + " attributes, but found " + found + "."
          + " Each <vars> element must have the same set of attributes."
        );
      }
      setupStoredVars(varsets[curVars]);
      curVars++;
    };

    //- retrieve the names of each attribute on the given XML node
    function attrNamesFor(node) {
      var attrNames = [];
      var varAttrs = node.attributes; // NamedNodeMap
      var v;
      for (v = 0; v < varAttrs.length; v++) {
        attrNames.push(varAttrs[v].nodeName);
      }
      return attrNames;
    }

    //- determine how many attributes are present on the given node
    function countAttrs(node) {
      return node.attributes.length;
    }

    //- set selenium variables from given XML attributes
    function setupStoredVars(node) {
      var varAttrs = node.attributes; // NamedNodeMap
      var v;
      for (v = 0; v < varAttrs.length; v++) {
        var attr = varAttrs[v];
        if (null === varsets[0].getAttribute(attr.nodeName)) {
          throw new Error("Inconsistent <testdata> at <vars> element #" + varsetIdx
            + "; found attribute " + attr.nodeName + ", which does not appear in the first <vars> element."
            + " Each <vars> element must have the same set of attributes."
          );
        }
        storedVars[attr.nodeName] = attr.nodeValue;
      }
    }

    //- format the given XML node for display
    function serializeXml(node) {
      if (XMLSerializer !== "undefined") {
        return (new XMLSerializer()).serializeToString(node) ;
      }
      if (node.xml) { return node.xml; }
      throw "XMLSerializer is not supported or can't serialize " + node;
    }
  }

  // ==================== JSONReader ====================

  $$.fn.JSONReader = function()
  {
    var varsets = null;
    var varNames = null;
    var curVars = null;
    var varsetIdx = 0;

    // load JSON file and return the list of var names found in the first object
    this.load = function(filepath)
    {
      var xmlHttpReq = doAjaxRequest(filepath);
      var fileObj = xmlHttpReq.responseText;
      fileObj = fileObj.replace(/\0/g, "");
      if (fileObj.charCodeAt(0) == 65533 && fileObj.charCodeAt(1) == 65533) {
        // strip UTF marker if present
        fileObj = fileObj.substr(2);
      }
      $$.LOG.info(fileObj);
      varsets = $$.evalWithVars(fileObj);
      if (varsets === null || varsets.length === 0) {
        throw new Error("A JSON object could not be loaded, or the file was empty.");
      }

      curVars = 0;
      varNames = attrNamesFor(varsets[0]);
      return varNames;
    };

    this.EOF = function() {
      return (curVars === null || curVars >= varsets.length);
    };

    this.next = function()
    {
      if (this.EOF()) {
        $$.LOG.error("No more JSON objects to read after object #" + varsetIdx);
        return;
      }
      varsetIdx++;
      $$.LOG.debug(varsetIdx + ") " + serializeJson(varsets[curVars]));  // log each name & value

      var expected = countAttrs(varsets[0]);
      var found = countAttrs(varsets[curVars]);
      if (found !== expected) {
        throw new Error("Inconsistent JSON object #" + varsetIdx
          + "; expected " + expected + " attributes, but found " + found + "."
          + " Each JSON object must have the same set of attributes."
        );
      }
      setupStoredVars(varsets[curVars]);
      curVars++;
    };

    //- retrieve the names of each attribute on the given object
    function attrNamesFor(obj) {
      var attrNames = [];
      var attrName;
      for (attrName in obj) {
        attrNames.push(attrName);
      }
      return attrNames;
    }

    //- determine how many attributes are present on the given obj
    function countAttrs(obj) {
      var n = 0;
      var attrName;
      for (attrName in obj) {
        n++;
      }
      return n;
    }

    //- set selenium variables from given JSON attributes
    function setupStoredVars(obj) {
      var attrName;
      for (attrName in obj) {
        if (null === varsets[0][attrName]) {
          throw new Error("Inconsistent JSON at object #" + varsetIdx
            + "; found attribute " + attrName + ", which does not appear in the first JSON object."
            + " Each JSON object must have the same set of attributes."
          );
        }
        storedVars[attrName] = obj[attrName];
      }
    }

    //- format the given JSON object for display
    function serializeJson(obj) {
      // firefox provides uneval()
      if (typeof uneval === "function") {
        var json = uneval(obj);
        return json.substring(1, json.length-1);
      }
      // others
      var buf = "";
      for (var attr in obj) {
        buf += " " + attr + ": " + obj[attr];
      }
      return "{" + buf + " }";
    }
  }

  function doAjaxRequest(filepath, mimeType)
  {
      var fileReader = new FileReader();
      var fileUrl;
      // in order to not break existing tests, the IDE will still use urlFor,
      // on the server, accessible with proper CORS headers.
      if ($$.seleniumEnv == "ide") {
        fileUrl = urlFor(filepath);
      } else {
        fileUrl = filepath;
      }
      var xmlHttpReq = fileReader.getDocumentSynchronous(fileUrl, mimeType);
      $$.LOG.info("Reading from: " + fileUrl);
      return xmlHttpReq;
  }

  function urlFor(filepath) {
    if (filepath.indexOf("http") == 0) {
      return filepath;
    }
    var URL_PFX = "file://";
    var url = filepath;
    if (filepath.substring(0, URL_PFX.length).toLowerCase() !== URL_PFX) {
      var testCasePath = testCase.file.path.replace("\\", "/", "g");
      var i = testCasePath.lastIndexOf("/");
      url = URL_PFX + testCasePath.substr(0, i) + "/" + filepath;
    }
    return url;
  }


  // ==================== File Reader ====================
  // Adapted from the include4ide plugin

  function FileReader() {}

  FileReader.prototype.prepareUrl = function(url) {
    var absUrl;
    // htmlSuite mode of SRC? TODO is there a better way to decide whether in SRC mode?
    if (window.location.href.indexOf("selenium-server") >= 0) {
      $$.LOG.debug("FileReader() is running in SRC mode");
      // there's no need to absolutify the url, the browser will do that for you
      // when you make the request. The data may reside anywhere on the site, or
      // within the "virtual directory" created by the selenium server proxy.
      // I don't want to limit the ability to parse files that actually exist on
      // the site, like sitemaps or JSON responses to api calls.
      absUrl = url;
    }
    else {
      absUrl = absolutify(url, selenium.browserbot.baseUrl);
    }
    $$.LOG.debug("FileReader() using URL to get file '" + absUrl + "'");
    return absUrl;
  };

  FileReader.prototype.getDocumentSynchronous = function(url, mimeType) {
    var absUrl = this.prepareUrl(url);
    var requester = this.newXMLHttpRequest();
    if (!requester) {
      throw new Error("XMLHttp requester object not initialized");
    }
    if (mimeType) {
      requester.overrideMimeType(mimeType);
    }
    requester.open("GET", absUrl, false); // synchronous (we don't want selenium to go ahead)
    try {
      requester.send(null);
    }
    catch(e) {
      throw new Error("Error while fetching URL '" + absUrl + "':: " + e);
    }
    if (requester.status !== 200 && requester.status !== 0) {
      throw new Error("Error while fetching " + absUrl
        + " server response has status = " + requester.status + ", " + requester.statusText );
    }
    return requester;
  };

  FileReader.prototype.newXMLHttpRequest = function() {
    var requester = 0;
    try {
      // for IE/ActiveX
      if (window.ActiveXObject) {
        try {       requester = new ActiveXObject("Msxml2.XMLHTTP"); }
        catch(ee) { requester = new ActiveXObject("Microsoft.XMLHTTP"); }
      }
      // Native XMLHttp
      else if (window.XMLHttpRequest) {
        requester = new XMLHttpRequest();
      }
    }
    catch(e) {
      throw new Error("Your browser has to support XMLHttpRequest in order to read data files\n" + e);
    }
    return requester;
  };

}(selblocks));

// ================================================================================
// from: xpath-processing.js

/** Provides richer functionality than is available via Selenium xpathEvaluator.
 *  Used only by locator-builders, because it assumes a Firefox environment.
 */
// selbocks name-space
(function($$){

  $$.xp =
  {
    // Evaluate an xpathExpression against the given document object.
    // The document is also the starting context, unless a contextNode is provided.
    // Results are in terms of the most natural type, unless resultType specified.
    evaluateXpath: function(doc, xpath, contextNode, resultType, namespaceResolver, resultObj)
    {
      $$.xp.logXpathEval(doc, xpath, contextNode);
      var isResultObjProvided = (resultObj != null);
      try {
        var result = doc.evaluate(
            xpath
            , contextNode || doc
            , namespaceResolver
            , resultType || XPathResult.ANY_TYPE
            , resultObj);
        $$.LOG.trace("XPATH Result: " + $$.xp.fmtXpathResultType(result) + " : " + xpath);
      }
      catch (err) {
        $$.LOG.error("XPATH: " + xpath);
        //$$.LOG.traceback(err);
        throw err;
      }
      if (isResultObjProvided)
        result = resultObj;

      return result;
    }

    // Find the first matching element
    ,selectElement: function(doc, xpath, contextNode) {
      var elems = $$.xp.selectElements(doc, xpath, contextNode);
      return (elems && elems.length > 0 ? elems[0] : null);
    }

    // Find all matching elements
    // TBD: make XPath engine choice configurable
    ,selectElements: function(doc, xpath, contextNode) {
      var elems = $$.xp.selectNodes(doc, xpath, contextNode);
      return elems;
    }

    // Select a single node
    // (analogous to xpath[1], without the axis-precedence gotchas)
    ,selectNode: function(doc, xpath, contextNode, resultType) {
      var result = $$.xp.evaluateXpath(doc, xpath, contextNode, resultType || XPathResult.FIRST_ORDERED_NODE_TYPE);
      return $$.unwrapObject(result.singleNodeValue);
    }

    // Select one or more nodes as an array
    ,selectNodes: function(doc, xpath, contextNode, resultType) {
      var result = $$.xp.evaluateXpath(doc, xpath, contextNode, resultType || XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
      var nodes = [];
      $$.xp.foreachNode(result, function (n, i) {
        nodes.push($$.unwrapObject(n));
      });
      return nodes;
    }

    // Select all matching nodes in the document, as a snapshot object
    ,selectNodeSnapshot: function(doc, xpath, contextNode) {
      return $$.xp.evaluateXpath(doc, xpath, contextNode, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
    }

    // Select the exact matching node, else null
    ,selectUniqueNodeNullable: function(doc, xpath, contextNode)
    {
      var nodeSet = $$.xp.selectNodeSnapshot(doc, xpath, contextNode);
      if (!nodeSet || nodeSet.snapshotLength == 0) {
        return null;
      }
      if (nodeSet.snapshotLength > 1) {
        $$.LOG.debug("Ambiguous: " + nodeSet.snapshotLength + " matches");
        return null;
      }
      return $$.unwrapObject(nodeSet.snapshotItem(0));
    }

    // Select matching node as string/number/boolean value
    // TBD: Exclude the text of certain node types (eg, script).
    //   A way to filter would be to add "//*[not(self::script)]/text()[normalize-space(.)!='']"
    //   But that yields a node set and XPath stringify operations only use the first node in a node set.
    //   Other invisibles: //*[contains(translate(@style,' ',''),'display:none') or contains(translate(@style,' ',''),'visibility:hidden')]
    //     (for inline styling at least, cascaded styling is not accessible via XPath)
    ,selectValue: function(doc, xpath, contextNode)
    {
      var result = $$.xp.evaluateXpath(doc, xpath, contextNode, XPathResult.ANY_TYPE);
      if (!result)
        return null;

      var value = null;
      switch (result.resultType) {
        case result.STRING_TYPE:  value = result.stringValue;  break;
        case result.NUMBER_TYPE:  value = result.numberValue;  break;
        case result.BOOLEAN_TYPE: value = result.booleanValue; break;
      }
      return value;
    }

    // Operate on each node in the given snapshot object
    ,foreachNode: function(nodeSet, callbackFunc)
    {
      if (!nodeSet)
        return;
      var i = 0;
      var n = nodeSet.snapshotItem(i);
      while (n != null) {
        var result = callbackFunc($$.unwrapObject(n), i);
        if (result == false) {
          return; // the callbackFunc can abort the loop by returning false
        }
        n = nodeSet.snapshotItem(++i);
      }
    }

    // Format an xpath result according to its data type
    ,fmtXpathResultType: function(result)
    {
      if (!result) return null;
      switch (result.resultType) {
        case result.STRING_TYPE:                  return "'" + result.stringValue + "'";
        case result.NUMBER_TYPE:                  return result.numberValue;
        case result.BOOLEAN_TYPE:                 return result.booleanValue;
        case result.ANY_UNORDERED_NODE_TYPE:      return "uNODE " + result.singleNodeValue;
        case result.FIRST_ORDERED_NODE_TYPE:      return "oNODE " + result.singleNodeValue;
        case result.UNORDERED_NODE_SNAPSHOT_TYPE: return result.snapshotLength + " uNODEs";
        case result.ORDERED_NODE_SNAPSHOT_TYPE:   return result.snapshotLength + " oNODEs";
        case result.UNORDERED_NODE_ITERATOR_TYPE: return "uITR";
        case result.ORDERED_NODE_ITERATOR_TYPE:   return "oITR";
      }
      return result;
    }

    // Log an xpath result
    ,logXpathEval: function(doc, xpath, contextNode)
    {
      $$.LOG.debug("XPATH: " + xpath);
      if (contextNode && contextNode != doc) {
        $$.LOG.debug("XPATH Context: " + contextNode);
      }
    }
  };

}(selblocks));

// ================================================================================
// from: selenium-executionloop-handleAsExitTest.js

// selbocks name-space
(function($$){
  /* This function replaces native Selenium command-handling for the exitScript command.
   * (See TestLoop.prototype.resume() in chrome/content/selenium-core/scripts/selenium-executionloop.js.)
   * This causes the script to simply halt rather continuing on to the next command.
   */
  $$.handleAsExitTest = function()
  {
    try {
      selenium.browserbot.runScheduledPollers();
      this.testComplete();
    }
    catch (e) {
      // seems highly unlikely that there would be an error in this very simple case
      this._handleCommandError(e); // marks command as failed (red), and overall test as failed
      this.testComplete();
    }
    $$.LOG.info("TEST HALTED");
  };

}(selblocks));

// ================================================================================
// from: selenium-executionloop-handleAsTryBlock.js

// selbocks name-space
(function($$){
  /* This function replaces native Selenium command-handling while inside a try block.
   * (See TestLoop.prototype.resume() in chrome/content/selenium-core/scripts/selenium-executionloop.js.)
   * Command processing is altered so that catch and/or finally processing is initiated upon error.
   */
  $$.handleAsTryBlock = function()
  {
    try {
      selenium.browserbot.runScheduledPollers();
      this._executeCurrentCommand();
      if (this.result.failed && isManaged(this.result)) {
        // a failed verify command has activated catch/finally bubbling
        this.continueTest();
      }
      else {
        // normal Selenium behavior
        this.continueTestWhenConditionIsTrue();
      }
    }
    catch (e) {
      if (isManaged(e)) {
        // a caught error has activated catch/finally bubbling
        this.continueTest();
      }
      else {
        // normal Selenium behavior
        if (!this._handleCommandError(e)) {
          // command is marked in red, and overall test status is failed
          this.testComplete();
        }
        else {
          // error has been otherwise handled by TestLoop.prototype._handleCommandError()
          // (not sure what the possibilities are, other than stopping and failing the script)
          this.continueTest();
        }
      }
    }

    //- determine if the error is caught or otherwise being bubbled
    function isManaged(e) {
      var interceptFrame = $$.fn.getInterceptTop();
      if (e.constructor.name == "AssertResult") {
        e = new Error(e.failureMessage);
      }
      return (interceptFrame && interceptFrame.attrs.manageError(e));
    }
  };

}(selblocks));
