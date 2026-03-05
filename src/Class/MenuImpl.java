package Class;
import Interface.*;
import java.util.Scanner;

public class MenuImpl implements Menu {
    Game game;
    Display console;
    public MenuImpl() throws InterruptedException {
        console = new DisplayImpl();
        chooseAction();
    }
    @Override
    public void chooseAction() throws InterruptedException {
        console.draw("0,0");
        Display.promt();
        Scanner console = new Scanner(System.in);
        String scanner = console.nextLine();
        switch (scanner) {
            case "1" -> startGame();
            case "2" -> endGame();
            default -> incorrectInput();
        }
    }

    @Override
    public void startGame() {
        Game game = new GameImpl();
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
