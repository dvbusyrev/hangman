package Class;
import Interface.*;

import java.util.NoSuchElementException;
import java.util.Scanner;

public class MenuImpl implements Menu {
    Game game;
    String language;
    Display console;

    private void languageChoosing() {
        Display.clear();
        System.out.println("CHOOSE LANGUAGE // ВЫБЕРЕТЕ ЯЗЫК");
        System.out.println();
        System.out.println("1. ENGLISH // АНГЛИЙСКИЙ");
        System.out.println("2. RUSSIAN // РУССКИЙ");
        System.out.println();
        System.out.println("INPUT 1 OR 2 // ВВЕДИТЕ 1 ИЛИ 2");
        System.out.println();
        Display.promt();
        String language_number = "";
        try {
            Scanner scanner = new Scanner(System.in, "CP866");
            language_number = scanner.nextLine();
        }
        catch (NoSuchElementException e) {
            System.out.println("\nВвод прерван (Ctrl+C). Завершение игры...");
            System.exit(0);  // корректное завершение
        }
        switch(language_number) {
            case "1" -> language = "ENGLISH";
            case "2" -> language =  "RUSSIAN";
            default -> languageChoosing();
        }
    }

    public MenuImpl() throws InterruptedException {
        languageChoosing();
        console = new DisplayImpl(language);
        chooseAction();
    }
    @Override
    public void chooseAction() throws InterruptedException {
        console.draw("0,0");
        Display.promt();
        Scanner console = new Scanner(System.in, "CP866");
        String scanner = "";
        try {
            scanner = console.nextLine();
        }
        catch (NoSuchElementException e) {
                System.out.println("\nВвод прерван (Ctrl+C). Завершение игры...");
                System.exit(0);  // корректное завершение
        }
        switch (scanner) {
            case "1" -> startGame();
            case "2" -> endGame();
            default -> incorrectInput();
        }
    }

    @Override
    public void startGame() throws InterruptedException{
        game = new GameImpl(console, language);
        game.play();
        chooseAction();
    }

    @Override
    public void incorrectInput() throws InterruptedException {
        console.draw("0,1");
        Thread.sleep(2000);
        chooseAction();
    }

    @Override
    public void endGame() throws InterruptedException {
        console.draw("0,2");
        Thread.sleep(2000);
        System.exit(0);
    }

}
