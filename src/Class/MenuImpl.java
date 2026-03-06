package Class;
import Interface.*;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.NoSuchElementException;
import java.util.Scanner;

public class MenuImpl implements Menu {
    Game game;
    String language;
    Display console;
    Scanner scanner;

    private void languagePick() {
        console.drawLanguagePick();
        Display.promt();
        String language_number = "";
        try {
            language_number = scanner.nextLine();
        }
        catch (NoSuchElementException e) {
            console.drawInterruption();
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
        console = new DisplayImpl();
        languagePick();
        console.picturesInit(language);
        chooseAction();
    }

    @Override
    public void chooseAction() throws InterruptedException {
        console.draw("0,0");
        Display.promt();
        String choosing = "";
        try {
            choosing = scanner.nextLine();
        }
        catch (NoSuchElementException e) {
                console.drawInterruption();
                System.exit(0);
        }
        switch (choosing) {
            case "1" -> startGame();
            case "2" -> endGame();
            default -> incorrectInput();
        }
    }

    @Override
    public void startGame() throws InterruptedException{
        game = new GameImpl(console, language, scanner);
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
