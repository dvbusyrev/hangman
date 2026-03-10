package Class;
import Interface.*;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.NoSuchElementException;
import java.util.Scanner;

public class MenuImpl implements Menu {
    private Game game;
    private String language;
    private Display display;
    private Scanner scanner;

    private void languagePick() {
        display.chooseLanguage();
        display.input();
        String language_number = "";
        try {
            language_number = scanner.nextLine();
        }
        catch (NoSuchElementException e) {
            display.interruption();
            System.exit(0);
        }
        switch(language_number) {
            case "1" -> language = "ENGLISH";
            case "2" -> language =  "RUSSIAN";
            default -> languagePick();
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
        languagePick();
        display.init(language);
        chooseAction();
    }

    @Override
    public void chooseAction() throws InterruptedException {
        display.chooseAction();
        display.input();
        String choosing = "";
        try {
            choosing = scanner.nextLine();
        }
        catch (NoSuchElementException e) {
                display.interruption();
                System.exit(0);
        }
        switch (choosing) {
            case "1" -> startGame();
            case "2" -> exitGame();
            default -> incorrectInput();
        }
    }

    @Override
    public void startGame() throws InterruptedException{
        game = new GameImpl(display, language, scanner);
        game.play();
        chooseAction();
    }

    @Override
    public void incorrectInput() throws InterruptedException {
        display.incorrectInput();
        Thread.sleep(2000);
        chooseAction();
    }

    @Override
    public void exitGame() throws InterruptedException {
        display.exitGame();
        Thread.sleep(2000);
        System.exit(0);
    }
}
