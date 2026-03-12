package com.busyrev.hangman.display;

import java.util.HashSet;
import java.util.List;

public record DrawInstruction(String type, int number) {
    private final static HashSet<String> GUI_TYPES = new HashSet<>(List.of("MENU", "SYSTEM", "MAN"));
    public DrawInstruction(String type, int number) {
        if (GUI_TYPES.contains(type)) {
            this.type = type;
            this.number = number;
        } else {
            throw new IllegalArgumentException("Invalid GUI type: " + type);
        }
    }
}
