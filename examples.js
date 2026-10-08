/* examples.js - small loadable examples for the platform editor. */
window.DF_EXAMPLES = [
  {
    name: 'hello guard',
    code: [
      '-- Simple script that calls home safely',
      'local msg = "Loaded safely"',
      '',
      'local function onLoad()',
      '  print(msg)',
      '  print("Authorized in")',
      'end',
      '',
      'onLoad()'
    ].join('\n')
  }
];
