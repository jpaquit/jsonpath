/* JSONPath 0.8.5 - XPath for JSON
 *
 * Copyright (c) 2007 Stefan Goessner (goessner.net)
 * Licensed under the MIT (MIT-LICENSE.txt) licence.
 *
 * Proposal of Chris Zyp goes into version 0.9.x
 * Issue 7 resolved
 *
 * 2020/01/09 - Add a patch to enable conditional regex as in jayway jsonpath ("=~")
 * 2021/08/30 - Replace all "instanceof Array", not robust enough: https://web.mit.edu/jwalden/www/isArray.html
 * 2021/09/06 - Refine conditional regex as it was buggy when grouping test conditions + add nullish coalescing operator (??) management
 * 2022/04/29 - Issue 4 fix was not enough, breaks on "$.[?(@.property == 'string(sequel)')]"
 *
 */
function jsonPath(obj, expr, arg) {
   var P = {
      resultType: arg && arg.resultType || "VALUE",
      result: [],
      normalize: function(expr) {
         var subx = [];
         return expr.replace(/\[(\'?)(\??\(.*?(?<!\\)(?:\\\\)*(?<=\(.*?)\)|.*?)(?<!\\)(?:\\\\)*\1(?<=\[.*?)\]/g, function($0,$1,$2){return "[#"+(subx.push($2)-1)+"]";})  /* http://code.google.com/p/jsonpath/issues/detail?id=4 */
                    .replace(/'?\.'?|\['?/g, ";")
                    .replace(/;;;|;;/g, ";..;")
                    .replace(/;$|'?\]|'$/g, "")
                    .replace(/#([0-9]+)/g, function($0,$1){return subx[$1];});
      },
      asPath: function(path) {
         var x = path.split(";"), p = "$";
         for (var i=1,n=x.length; i<n; i++)
            p += /^[0-9*]+$/.test(x[i]) ? ("["+x[i]+"]") : ("['"+x[i]+"']");
         return p;
      },
      store: function(p, v) {
         if (p) P.result[P.result.length] = P.resultType == "PATH" ? P.asPath(p) : v;
         return !!p;
      },
      trace: function(expr, val, path) {
         if (expr !== "") {
            var x = expr.split(";"), loc = x.shift();
            x = x.join(";");
            if (val && Object.prototype.hasOwnProperty.call(val,loc))
               P.trace(x, val[loc], path + ";" + loc);
            else if (loc === "*")
               P.walk(loc, x, val, path, (m,l,x,v,p) => P.trace(m+";"+x,v,p));
            else if (loc === "..") {
               P.trace(x, val, path);
               P.walk(loc, x, val, path, (m,l,x,v,p) => typeof v[m] === "object" ? P.trace("..;"+x,v[m],p+";"+m) : false);
            }
            else if (/^\(.*?\)$/.test(loc)) // [(expr)]
               P.trace(P.eval(loc, val)+";"+x, val, path);
            else if (/^\?\(.*?\)$/.test(loc)) // [?(expr)]
               P.walk(loc, x, val, path, (m,l,x,v,p) => { if (P.eval(l.replace(/^\?\((.*?)\)$/,"$1"), Array.isArray(v) ? v[m] : v)) P.trace(m+";"+x,v,p); }); // issue 5 resolved
            else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) // [start:end:step]  python slice syntax
               P.slice(loc, x, val, path);
            else if (/,/.test(loc)) { // [name1,name2,...]
               for (var s=loc.split(/'?,'?/),i=0,n=s.length; i<n; i++)
                  P.trace(s[i]+";"+x, val, path);
            }
         }
         else
            P.store(path, val);
      },
      walk: function(loc, expr, val, path, f) {
         if (Array.isArray(val)) {
            for (var i=0,n=val.length; i<n; i++)
               if (i in val)
                  f(i,loc,expr,val,path);
         }
         else if (typeof val === "object") {
            for (var m in val)
               if (Object.prototype.hasOwnProperty.call(val,m))
                  f(m,loc,expr,val,path);
         }
      },
      slice: function(loc, expr, val, path) {
         if (Array.isArray(val)) {
            var len=val.length, start=0, end=len, step=1;
            loc.replace(/^(-?[0-9]*):(-?[0-9]*):?(-?[0-9]*)$/g, function($0,$1,$2,$3){start=parseInt($1||start);end=parseInt($2||end);step=parseInt($3||step);});
            start = (start < 0) ? Math.max(0,start+len) : Math.min(len,start);
            end   = (end < 0)   ? Math.max(0,end+len)   : Math.min(len,end);
            for (var i=start; i<end; i+=step)
               P.trace(i+";"+expr, val, path);
         }
      },
      eval: function(x, _v) {
         let evaluationString = `${x.replace(/(?<=^|(?<!\\)(?:\\\\)*)@(?![\da-z])/gi, "_v")
                                 .replace(/\\@/g, "@") // issue 7 : resolved ..
                                 .replace(/\(* *(_v(?:\[(['"`]).*?(?<!\\)\2\]|\.[^\s]*?)*) *(?!&&|\|\||\?\?)=~ *\/(.*?(?<!\\)(?:\\\\)*)\/([igmsuy]*) *\)*(?=(?:(?:(?:&&|\|\||\?\?)(?= *\(* *_v)))|$)/g, (match, p1, p2, p3, p4) => {return match ? ' '+RegExp(p3,p4)+'.test('+p1+') ' : match}) // 2020/01/09 - manage regexp syntax "=~"
         }`
         try { return $ && _v && (Function(`let _v = arguments[0]; return ${evaluationString}`))(_v) }
         catch(e) { throw new SyntaxError("jsonPath: " + e.message + ": " + evaluationString) }
      }
   };

   var $ = obj;
   if (expr && obj && (P.resultType == "VALUE" || P.resultType == "PATH")) {
      P.trace(P.normalize(expr).replace(/^\$;?/,""), obj, "$");  // issue 6 resolved
      return P.result.length ? P.result : false;
   }
}
