-- unusual but valid call syntaxes
local function f(x) return "f:" .. tostring(x) end
print(f"string-arg")
print(f{ "table-arg" }[1])
print(f("paren"))

local obj = {}
function obj:m(x) return "m:" .. tostring(x) end
print(obj:m"str")
print(obj:m{ 1 }[1])
print(obj:m(1))

print(("x"):rep(3))
print((f)(1))
print((function() return "iife" end)())

local chain = {}
function chain:a() return self end
function chain:b() return "b" end
print(chain:a():a():b())

local t = { [1] = "one", ["key"] = "value", 2, three = 3 }
print(t[1], t.key, t[2], t.three)

local nested = { a = { b = { c = { d = "bottom" } } } }
nested.a.b.c.d = "changed"
print(nested.a.b.c.d)

local arr = { 1, 2, 3, 4, 5 }
print(#arr, table.concat(arr, "-"))
print(unpack and "has unpack" or "no unpack")
