-- numeric literal forms and math
print(0x1A, 0xFF, 0b1010, 1_000_000)
print(1e3, 1E-3, .5, 5., 100)
print(7 // 2, 7 % 2, 2 ^ 10, -2 ^ 2, 2 ^ 3 ^ 2)
print(math.floor(3.7), math.ceil(3.2), math.abs(-5), math.max(1, 9, 3))
print(0.1 + 0.2 == 0.3)
print(math.pi > 3.14)
local big = 9007199254740991
print(big // 1 == big)
print(1 / 3)
print(-0.0, 1e308 * 10)
for i = 1, 10, 3 do print("step", i) end
for i = 10, 1, -3 do print("down", i) end
print(tostring(10), tostring(10.0))
print(("%.3f"):format(1 / 3))
