package com.busyrev.hangman;

import com.busyrev.hangman.menu.MenuImpl;

public class Main {
    public static void main(String[] args) {
        try {
            new MenuImpl();
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
    }
}