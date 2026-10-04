-- basic control flow, functions, tables, closures
local function add(a, b) return a + b end
print("add", add(2, 3))

local t = { 1, 2, 3, name = "tbl", nested = { deep = { value = 42 } } }
print(t[1], t.name, t.nested.deep.value)

for i = 1, 3 do print("i", i) end
for k, v in pairs({ a = 1, b = 2 }) do print("pair", k, v) end
for k, v in ipairs(t) do print("ipair", k, v) end

local n = 0
while n < 3 do n += 1 end
print("while", n)

repeat local z = n n -= 1 until n <= 0
print("repeat", n)

local counter = 0
local function makeCounter()
  counter = counter + 1
  return function() return counter end
end
local c1, c2 = makeCounter(), makeCounter()
print("closure", c1(), c2())

if add(1, 1) == 2 then print("if ok") elseif false then print("bad") else print("bad2") end
print("ternary", if n == 0 then "zero" elseif n == 1 then "one" else "many")

local a, b = 1, 2
a, b = b, a
print("swap", a, b)

do
  local scoped = "inner"
  print(scoped)
end

local x = x or 1  -- refers to global x (nil) -> 1
print("globalOr", x)
