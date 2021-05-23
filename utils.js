var fs = require('fs')
var path = require('path')
var http = require('http')

//copy: copyDir
//move: rename
//delete: unlink

function mkdir(dir) {
  try {
    fs.mkdirSync(dir, '0755')
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e
    }
  }
}

function rmdir(dir) {
  if (path.existsSync(dir)) {
    var list = fs.readdirSync(dir)
    for (var i = 0; i < list.length; i++) {
      var filename = path.join(dir, list[i])
      var stat = fs.statSync(filename)
      if (filename === '.' || filename === '..') {
      } else if (stat.isDirectory()) {
        rmdir(filename)
      } else {
        fs.unlinkSync(filename)
      }
    }
    fs.rmdirSync(dir)
  } else {
    console.warn('warn: ' + dir + ' not exists')
  }
}

function copydir(src, dest) {
  mkdir(dest)
  var files = fs.readdirSync(src)
  for (var i = 0; i < files.length; i++) {
    var current = fs.lstatSync(path.join(src, files[i]))
    if (current.isDirectory()) {
      copydir(path.join(src, files[i]), path.join(dest, files[i]))
    } else if (current.isSymbolicLink()) {
      var symlink = fs.readlinkSync(path.join(src, files[i]))
      fs.symlinkSync(symlink, path.join(dest, files[i]))
    } else {
      fs.copyFileSync(path.join(src, files[i]), path.join(dest, files[i]))
    }
  }
}

function getFile(url, file = url.match(/\./) ? new URL(file).pathname : 'downloaded-file.txt') {
  url = url.match(/\./) ? url : 'https://raw.githubusercontent.com/' + url + '/master/' + file
  http.get(url, (res) => res.pipe(fs.createWriteStream(file.split('/').pop())))
}

function recurdir(dir) {
  const filePaths = []
  function recur(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    items.forEach((item) => {
      const url = path.join(dir, item.name)
      if (item.isDirectory()) recur(url)
      else if (item.isFile()) filePaths.push(path.resolve(url).replace(/\\/g, '/'))
    })
  }
  recur(dir)
  return filePaths.sort()
}

module.exports = {
  mkdir,
  rmdir,
  copydir,
  move,
  getFile,
  recurdir,
}
