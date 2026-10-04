-- degenerate / edge inputs
print("empty ok")
--[[ block comment
spanning lines ]]
-- line comment
print(("x"):rep(3))
local s = "unicode: éè你好 \t\n quotes \"' \\ end"
print(#s > 0, s:len() > 0)
local t = {}
t[t] = t
t.self = t
print(t.self == t)
local deep = {{{{{{{{{{1}}}}}}}}}}
print(deep[1][1][1][1][1][1][1][1][1][1])
print(1e308 * 10, -1e308 * 10, 0/0 ~= 0/0)
print(math.huge, -math.huge, tostring(0/0))
print(1 // 0, 1 % 0, -1 // 0)
print(#(""), #{}, #"\255")
print(string.char(65, 66, 67), ("abc"):byte(1, -1))
local function varargs(...) return select("#", ...), ... end
print(varargs())
print(varargs(nil, nil, 3))
local arr = { 1, 2, 3, nil, 5 }
print(#arr >= 3, arr[5])
print(table.unpack(arr, 1, 3))
print(next({}))
print(pcall(function() error() end))
print(select(-1, "a", "b", "c"))
print(("a"):rep(0) == "", ("ab"):sub(-1))
local mt = setmetatable({}, { __index = function(_, k) return "gen:" .. tostring(k) end })
print(mt.anything, mt[1])
print(rawget({}, "x"), rawlen({1,2}))
print(tostring(nil), tostring(true), tonumber("0x10"), tonumber("10", 2))
print(string.format("%5.2f|%s|%q", 3.14159, "s", "q"))
