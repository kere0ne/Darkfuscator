-- global reads/writes (exercises the global-capture safety rules)
print = print
math = math
string = string
table = table

GLOBAL_READ = 1
print("read global", GLOBAL_READ)
GLOBAL_READ = GLOBAL_READ + 1
print("write global", GLOBAL_READ)

function GlobalFunc(x)
  return x * 3
end
print(GlobalFunc(3))

Lazy = Lazy or "initialized"
print(Lazy)

local shadowPrint = print
shadowPrint("via local")

local t = {}
t.print = print
t.print("via field")

print(math.floor(1.5), string.upper("up"), table.concat({ "a", "b" }, ","))
print(type(print), type(nil), type(1), type("s"), type({}), type(print))
print(select("#", 1, 2, 3))
