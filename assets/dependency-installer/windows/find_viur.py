# -*- coding: utf-8 -*-
__author__ = "Stefan Kögl <sk@mausbrand.de>"

import _winreg


def regkey_value(path, name="", start_key = None):
	if isinstance(path, str):
		path = path.split("\\")
	if start_key is None:
		start_key = getattr(_winreg, path[0])
		return regkey_value(path[1:], name, start_key)
	else:
		subkey = path.pop(0)
	with _winreg.OpenKey(start_key, subkey) as handle:
		assert handle
		if path:
			return regkey_value(path, name, handle)
		else:
			desc, i = None, 0
			while not desc or desc[0] != name:
				desc = _winreg.EnumValue(handle, i)
				i += 1
			return desc[1]

result = regkey_value("HKEY_LOCAL_MACHINE\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall", "Mausbrand")
print("has viur admin installed?", result)
