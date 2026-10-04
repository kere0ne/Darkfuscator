-- broad dialect check
local n1, n2, n3, n4 = 0xFF, 0b1010, 1_000, 1e3
local n5, n6 = .5, 5.
print(n1, n2, n3, n4, n5, n6)
local long = [[raw
multi]]
local long2 = [==[has ]] inside]==]
print(#long > 0, long2)
-- repeat: the until expression sees body locals
repeat
  local counter = 1
until counter == 1
print("repeat scope ok")
-- chunk-level varargs
local function pass(...) return ... end
print(pass(1, nil, 3))
-- long chains and mixed assignment
local a = {}
a.b = a
a.b.c = {}
a.b.c.d = "deep"
local e = a.b.c.d
print(e, a.b.c.d == e)
-- multiple returns in every position
local function three() return 1, 2, 3 end
print(three())
print((three()))
print(({ three() })[3])
print(#{ three() })
local x, y, z = three()
print(x, y, z)
print(select("#", three()))
-- string library on a string value
print(("Hello"):upper(), ("Hello"):sub(1, 3), ("a,b,c"):split(",")[2])
-- table library
local t = table.pack(1, nil, 3)
print(t.n, t[1], t[3])
print(table.unpack({ 1, 2, 3 }))
print(table.concat({ "a", "b" }, "-"))
-- nested closures returned
local function counter(start)
  local n = start
  return function() n = n + 1 return n end, function() return n end
end
local inc, get = counter(10)
inc(); inc()
print(get(), inc())
-- method chain on a metatable
local Class = {}
Class.__index = Class
function Class.new(v) return setmetatable({ v = v }, Class) end
function Class:add(o) return Class.new(self.v + o.v) end
function Class:str() return "C(" .. self.v .. ")" end
local c1, c2 = Class.new(2), Class.new(3)
print(c1:add(c2):str())
-- shadowing and re-declaration
local v = 1
do local v = 2 print(v) end
print(v)
local v2 = "outer"
for i = 1, 2 do local v2 = "inner" .. i print(v2) end
print(v2)
