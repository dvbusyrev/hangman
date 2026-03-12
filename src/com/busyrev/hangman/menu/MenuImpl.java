package com.busyrev.hangman.menu;
import com.busyrev.hangman.display.Display;
import com.busyrev.hangman.display.DisplayImpl;
import com.busyrev.hangman.game.Game;
import com.busyrev.hangman.game.GameImpl;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.NoSuchElementException;
import java.util.Scanner;

public class MenuImpl implements Menu {
    private Game game;
    private String language;
    private Display display;
    private Scanner scanner;

    private String chooseLanguage() {
        while (true) {
            display.displayChooseLanguage();
            display.displayInput();
            String language_number = "";
            try {
                language_number = scanner.nextLine();
            } catch (NoSuchElementException e) {
                display.displayInterruption();
                System.exit(0);
            }
            switch (language_number) {
                case "1" -> { return "ENGLISH"; }
                case "2" -> { return "RUSSIAN"; }
            }
        }
    }

    private void scannerInit() {
        String os = System.getProperty("os.name").toLowerCase();
        Charset charset;

        if (os.contains("win")) {
            charset = Charset.forName("CP866");
        } else {
            charset = StandardCharsets.UTF_8;
        }
        scanner = new Scanner(System.in, charset);
    }

    public MenuImpl() throws InterruptedException {
        scannerInit();
        display = new DisplayImpl();
        language = chooseLanguage();
        display.init(language);
        chooseAction();
    }

    @Override
    public void chooseAction() throws InterruptedException {
        while (true) {
            display.displayChooseAction();
            display.displayInput();
            String choosing = "";
            try {
                choosing = scanner.nextLine();
            } catch (NoSuchElementException e) {
                display.displayInterruption();
                System.exit(0);
            }
            switch (choosing) {
                case "1" -> {
                    startGame();
                    return;
                }
                case "2" -> {
                    exitGame();
                    return;
                }
            }
            display.displayIncorrectInput();
            Thread.sleep(2000);
        }
    }

    @Override
    public void startGame() throws InterruptedException{
        game = new GameImpl(display, language, scanner);
        game.play();
        chooseAction();
    }

    @Override
    public void exitGame() throws InterruptedException {
        display.displayExitGame();
        Thread.sleep(2000);
        System.exit(0);
    }
}
