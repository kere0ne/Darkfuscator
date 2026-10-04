-- every string form
print("double")
print('single')
print([[long
string]])
print([==[nested ]] bracket]==])
print("escapes: \n\t\\ \" \65 \x41 \u{48}")
print("z-escape: A\z
      B")
print("unicode: héllo wörld")
local withNull = "a\0b"
print("null len", #withNull)
print(("concat"):upper(), ("  pad  "):gsub(" ", "_"))
print(string.format("%d-%s", 42, "x"))
print(("a"):rep(3) .. ("b"):rep(2))
print(#"", #"\255\254")
local long = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor."
print(#long, long:sub(1, 5))
print(`interp {1 + 2} end`)
print(tostring(("x"):byte()), ("ABC"):len())
