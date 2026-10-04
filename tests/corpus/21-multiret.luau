local function varargs(...) return select("#", ...), ... end
print(varargs())
print(varargs(1))
print(varargs(1, 2, 3))
local function three() return 1, 2, 3 end
local function prefixed() return "x", three() end
print(prefixed())
local function trailingNil() return "a", nil, "c" end
print(trailingNil())
local function mixed(...) return "s", ..., "e" end
print(mixed())
print(mixed(1, 2))
print(#{ varargs() }, #{ varargs(1, 2) })
print(({ varargs(1, 2) })[1])
local a, b, c = varargs(1, 2)
print(a, b, c)
