(function () {
  "use strict";

  // Import
  var fs = require('fs')
    , path = require('path')
    , spawn = require('child_process').spawn
    , util = require('util')
  // Requirement
  //
    , _ = require('underscore')                    // * [underscoreJS]
    , commander = require('commander')
    , Deferred = require('jsdeferred').Deferred   // * [jsDeferred](https://github.com/cho45/jsdeferred)
    , uglify = require('uglify-js2')              // * [UglifyJS2](https://github.com/mishoo/UglifyJS2)
    , dox = require('dox')                        // * [dox](https://github.com/visionmedia/dox)
    , jade = require('jade')                      // * [jade](https://github.com/visionmedia/jade)
    , docco = require('docco')                    // * [docco](http://jashkenas.github.com/docco/), docco requires [Pygments](http://pygments.org/)
    , dox = require(path.join(__dirname + '../../../doxor/lib/doxor'))

  // Configuration (set with commander)
  //
    , VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'))).version
    , DEFAULTS = {
      watch: false,
      doxor: {
        output: 'docs/api'
      },
      docco: {
        output: 'docs/src'
      }
    }
    ;


  function run() {
    commander
      .version(VERSION)
      .usage("[options] <filePattern ...>")
      .option("-j, --join [path]", "join files")
      .option("-m, --minimize [path]", "minimize files")
      .option("-w, --watch", "watch files", DEFAULTS.watch)
      .option("--doxor", "exec doxor command", DEFAULTS.doxor)
      .option("--docoo", "exec docoo command", DEFAULTS.docoo)
      .parse(process.argv)
      .name = 'makejs';

    if (commander.args.length) {
      make(commander.args.slice(), commander);
    } else {
      util.puts(commander.helpInformation());
    }
  }

  function make(sources, options) {
    var make = function () {
      runTask(sources, options);
      if (options.watch) {
        watch(sources, make);
      }
    };

    options = _.extend(DEFAULTS, options);
    make();
  }

  var runTask = (function () {
    var timeoutId
      , run = function (sources, options) {
        return Deferred
          .next(function () {
            if (options.join) {
              join(sources, options.join);
            }
          })
          .next(function () {
            if (options.minify) {
              if (options.join) {
                minify(options.join, options.minify);
              } else {
                minify(sources, options.minify);
              }
            }
          })
          .next(function () {
            if (options.test) {
              test(options.test);
            }
          })
          .next(function () {
            if (options.doxor) {
              return callDoxor(sources, options.doxor);
            }
          })
          .next(function () {
            if (options.docco) {
              return callDocco(sources, options.docco);
            }
          })
          .error(function (err) {
            util.stack(err);
          });
      }
      ;

    return function (sources, options) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(function () {
        run(sources, options);
      }, 1000);
    };
  })();

  function join(sources, target) {
    console.log('join');
    var filenames = [];
    sources.forEach(function (source) {
      filenames = filenames.concat(findFiles(source));
    });
    filenames.forEach(function (filename) {
      console.log(filename);
    });
  }

  function compile(options) {
    var filenames = findFiles(sourceDir)
      , code = copyright(VERSION) + prefix() + implement(filenames) + postfix()
      , minified = copyright(VERSION) + minify(code)
      ;

    fs.writeFileSync(path.join(libraryDir, options.join), code, 'utf-8');
    fs.writeFileSync(path.join(libraryDir, options.minify), minified, 'utf-8');
  }

  function findFiles(context, filenames) {
    var stats = fs.statSync(context)
      ;

    if (filenames == null) {
      filenames = [];
    }

    if (stats.isFile()) {
      filenames.push(context);
    } else if (stats.isDirectory()) {
      fs.readdirSync(context).forEach(function (child) {
        findFiles(path.join(context, child), filenames);
      });
    }

    return filenames;
  }

  function minify(code) {
    console.log('minify');
    return uglify.minify(code, {
      fromString: true
    }).code;
  }

  function test() {
    var dfd = new Deferred()
      , nodeunit = spawn('nodeunit', [testDir])
      ;

    nodeunit.stdout.on('data', function (data) {
      util.print(data);
    });
    nodeunit.stderr.on('data', function (data) {
      util.print(data);
      dfd.fail();
    });
    nodeunit.on('exit', function (code) {
      dfd.call();
    });
  }

  function callDoxor(sources, options) {
    return dox.document(sources, options);
  }

  function callDocco(sources, options) {
    var dfd = new Deferred()
      ;

    docco
      .document(sources, options, function () {
        dfd.call();
      });

    return dfd;
  }


  function copyright(version) {
    return [
      '/**',
      ' * @fileOverview',
      ' * @name muon.js',
      ' * @author Daisuke Mino daisuke.mino@gmail.com',
      ' * @url https://github.com/minodisk/muon',
      ' * @version ' + version,
      ' * @license MIT License',
      ' */',
      ''
    ].join('\n');
  }

  function prefix() {
    return [
      ";(function () {",
      "  'use strict';",
      "",
      ""
    ].join('\n');
  }

  function implement(filenames) {
    var files = []
      , blocks = [];

    filenames.forEach(function (filename) {
      var extname, code, relativeFilename, packageName, className, topLevel, names, file
        ;

      extname = path.extname(filename);
      if (extname === '') {
        extname = path.basename(filename);
      }
      switch (extname) {
        case '.js':
          code = fs.readFileSync(filename, 'utf-8');
          break;
        case '.coffee':
          code = fs.readFileSync(filename, 'utf-8');
          break;
        default:
          return;
      }

      relativeFilename = path.relative(sourceDir, filename);
      packageName = path.dirname(relativeFilename);
      className = path.basename(relativeFilename, path.extname(relativeFilename));
      topLevel = className.charAt(0) === '_';
      if (topLevel) {
        while (className.charAt(0) === '_') {
          className = className.substr(1);
        }
      }
      if (packageName === '.') {
        names = [className];
      } else {
        names = packageName.split('/');
        names.push(className);
      }

      files.push({
        namespace: names.join('.'),
        code     : code,
        topLevel : topLevel
      });
    });

    files.sort(function (a, b) {
      if ((a.topLevel && b.topLevel) || (!a.topLevel && !b.topLevel)) {
        if ([a.namespace, b.namespace].sort().indexOf(a.namespace) === 0) {
          return -1;
        } else {
          return 1;
        }
      } else if (a.topLevel) {
        return -1;
      } else if (b.topLevel) {
        return 1;
      }
    });

    files.forEach(function (file, i) {
      var lines = []
        , indent
        , code
        ;

      indent = file.topLevel ? '  ' : '    ';
      file.code.split('\n').forEach(function (line, j) {
        lines[j] = indent + line;
      });
      code = lines.join('\n');
      blocks[i] = file.topLevel ? code + '\n' : "  define('" + file.namespace + "', function (require, module, exports) {\n" +
        code + '\n' +
        '  });\n';
    });
    return blocks.join('\n');
  }

  function postfix() {
    return [
      "  this.require = Module.require;",
      "",
      "}).call(this);",
      ""
    ].join('\n');
  }

  // ## Start Watch Directories
  //
  // 1. Close old watchers.
  // 2. Make new collection.
  // 3. Watch directories recursively.
  var watch = (function () {
    var watchers
      , watchRecursively = (function () {
        var currentDir;
        return function (dirOrFiles, callback) {
          dirOrFiles.forEach(function (fileOrDir) {
            var isRoot = currentDir == null
              , stats
              ;

            if (!isRoot) {
              fileOrDir = path.join(currentDir, fileOrDir);
            }
            if (fs.existsSync(fileOrDir)) {
              stats = fs.statSync(fileOrDir);
              if (isRoot && stats.isFile()) {
                watch(fileOrDir, callback);
              } else if (stats.isDirectory()) {
                watch(fileOrDir, callback);
                currentDir = fileOrDir;
                watchRecursively(fs.readdirSync(fileOrDir), callback);
              }
            }
          });
        };
      })()
      , watch = function (fileOrDir, callback) {
        var watcher = fs.watch(fileOrDir);
        watcher.on('change', callback);
        watchers.push(watcher);
      }
      ;

    return function (sources, callback) {
      if (watchers) {
        watchers.forEach(function (watcher) {
          watcher.removeAllListeners();
          watcher.close();
        });
      }
      watchers = [];
      watchRecursively(sources, callback);
    };
  })();

  exports.run = run;

})();