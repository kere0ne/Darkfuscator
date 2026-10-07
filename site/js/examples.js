/* examples.js - small loadable examples for the platform editor. */
window.DF_EXAMPLES = [{ name: 'hello guard', code: "-- hello guard\nlocal msg = \"Loaded safely\"\n\nlocal function onLoad()\n  print(msg)\n  print(\"Authorized in\")\nend\n\nonLoad()\n" }];
